import { createServer } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createAuth } from './auth.js';
import { createAI } from './ai.js';
import { createCatalogCache } from './catalog-cache.js';
import { HttpError, unwrap } from './errors.js';
import { categorySchema, chatSchema, idSchema, itemSchema, translationKeys } from './validation.js';
import { recommend } from './recommendations.js';
import { createConversationCache, createMenuRetriever } from './menu-retrieval.js';
import { uploadImages, optimizeItem } from './images.js';
import { answerRestaurant, createKnowledgeStore, knowledgeUpdateSchema } from './knowledge.js';

export async function readBody(req, limit = 65536, raw = false) {
  const buffer = await new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > limit) { chunks.length = 0; reject(new HttpError(413, 'Request is too large.')); }
      else chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
  if (raw) return buffer;
  if (!(req.headers['content-type'] || '').startsWith('application/json')) throw new HttpError(415, 'Send application/json.');
  try { return JSON.parse(buffer.toString()); } catch { throw new HttpError(400, 'Invalid JSON.'); }
}

export function createRateLimiter(now = Date.now) {
  const buckets = new Map();
  return (key, limit, windowMs = 60000) => {
    const time = now();
    if (buckets.size > 10000) for (const [id, bucket] of buckets) if (bucket.until < time) buckets.delete(id);
    if (!buckets.has(key) || buckets.get(key).until < time) buckets.set(key, { count: 0, until: time + windowMs });
    const bucket = buckets.get(key);
    if (++bucket.count > limit) throw new HttpError(429, 'Too many requests. Please try again shortly.');
  };
}

// Paginate server-side to avoid Supabase's default 1000-row cap.
export async function allItems(client, columns = '*') {
  const items = [];
  for (let from = 0; ; from += 500) {
    const page = unwrap(await client.from('menu_items').select(columns).order('id').range(from, from + 499));
    items.push(...page);
    if (page.length < 500) return items;
  }
}

export function createApp(config, dependencies = {}) {
  const auth = dependencies.auth || createAuth(config);
  const ai = dependencies.ai || createAI(config, fetch, { onDiagnostic: dependencies.onAIDiagnostic || (entry => console.info(JSON.stringify(entry))) });
  const knowledge = dependencies.knowledge || createKnowledgeStore(config.knowledgePath);
  const conversations = createConversationCache();
  const retriever = createMenuRetriever();
  const limit = createRateLimiter();
  const jobs = new Map();
  const viewed = new Map();
  let daily = { date: '', count: 0 };
  function useAIQuota() {
    const date = new Date().toISOString().slice(0, 10);
    if (daily.date !== date) daily = { date, count: 0 };
    if (++daily.count > config.dailyLimit) throw new HttpError(429, 'AI daily limit reached. Please use the menu filters.');
  }
  const send = (res, body, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); };
  const ipOf = req => config.trustProxy ? String(req.headers['x-forwarded-for'] || req.socket.remoteAddress).split(',').at(-1).trim() : req.socket.remoteAddress;
  const countsFor = async client => {
    const result = await client.rpc('get_menu_item_view_counts');
    return { counts: result.error ? [] : result.data || [], popularityAvailable: !result.error && (result.data || []).some(row => Number(row.view_count) > 0) };
  };
  // Only scalar/text dish data and presentation URLs; never image bytes or
  // arbitrary extra columns. Admin tools still fetch full records separately.
  const itemFields = ['id', 'name', 'description', ...translationKeys, 'price', 'vat', 'category_id', 'badges', 'image_url', 'thumbnail_url', 'created_at', 'updated_at'];
  const categoryFields = ['id', 'name', 'display_name', 'display_order', 'is_active', 'created_at', 'updated_at'];
  const catalog = async () => {
    const [categoryResult, rows, popularity] = await Promise.all([
      auth.publicClient.from('categories').select(categoryFields.join(',')).eq('is_active', true).order('display_order'),
      allItems(auth.publicClient, itemFields.join(',')),
      countsFor(auth.publicClient).catch(() => ({ counts: [], popularityAvailable: false })),
    ]);
    const categories = unwrap(categoryResult).map(category => Object.fromEntries(categoryFields.filter(field => field in category).map(field => [field, category[field]])));
    const active = new Set(categories.map(category => category.id));
    const items = rows.filter(item => active.has(item.category_id)).map(item => Object.fromEntries(itemFields.filter(field => field in item).map(field => [field, item[field]])));
    const catalogVersion = createHash('sha256').update(JSON.stringify([categories, items])).digest('hex');
    return { categories, items, catalogVersion, ...popularity };
  };
  const catalogCache = createCatalogCache({ load: catalog,
    onError: error => console.warn(JSON.stringify({ event: 'catalog.refresh_failed', status: error.status || 503 })),
  });
  const cachedCatalog = () => catalogCache.get();
  const invalidateCatalog = () => catalogCache.invalidate();

  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    const origin = req.headers.origin;
    try {
      if (origin && !config.origins.includes(origin)) throw new HttpError(403, 'Origin not allowed.');
      if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); res.setHeader('Access-Control-Allow-Credentials', 'true'); }
      if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS' }); res.end(); return; }
      if (req.headers['sec-fetch-site'] === 'cross-site' && !origin) throw new HttpError(403, 'Cross-site request rejected.');
      const url = new URL(req.url, 'http://localhost');
      const path = url.pathname;
      const method = req.method;
      const ip = ipOf(req);
      limit(`api:${ip}`, 240);
      if (method === 'GET' && path === '/api/health') return send(res, { ok: true, aiConfigured: ai.configured });
      if (method === 'GET' && path === '/api/categories') return send(res, { data: (await cachedCatalog()).categories });
      if (method === 'GET' && path === '/api/menu') {
        let items = (await cachedCatalog()).items;
        const search = (url.searchParams.get('search') || '').trim().toLowerCase().slice(0, 200);
        const category = url.searchParams.get('category');
        const sort = url.searchParams.get('sort') || 'default';
        if (search) items = items.filter(item => `${item.name} ${item.description}`.toLowerCase().includes(search));
        if (category && category !== 'all') items = items.filter(item => item.category_id === category);
        const sorts = { 'price-asc': (a, b) => a.price - b.price, 'price-desc': (a, b) => b.price - a.price, 'name-asc': (a, b) => a.name.localeCompare(b.name), 'name-desc': (a, b) => b.name.localeCompare(a.name) };
        items = [...items].sort(sorts[sort] || ((a, b) => a.created_at.localeCompare(b.created_at)));
        const page = z.coerce.number().int().min(1).max(100000).parse(url.searchParams.get('page') || 1);
        return send(res, { data: items.slice((page - 1) * 20, page * 20), count: items.length });
      }
      if (method === 'POST' && path === '/api/page-views') {
        limit(`page:${ip}`, 20);
        const body = z.object({ page_path: z.string().max(200) }).parse(await readBody(req));
        unwrap(await auth.publicClient.from('page_views').insert({ page_path: body.page_path, user_agent: String(req.headers['user-agent'] || '').slice(0, 500) }));
        return send(res, { ok: true });
      }
      const viewMatch = path.match(/^\/api\/menu\/([^/]+)\/views$/);
      if (method === 'POST' && viewMatch) {
        const id = idSchema.parse(viewMatch[1]);
        limit(`views:${ip}`, 30);
        const key = `${ip}:${id}`;
        if ((viewed.get(key) || 0) > Date.now()) return send(res, { ok: true });
        if (!(await cachedCatalog()).items.some(item => item.id === id)) throw new HttpError(404, 'Dish not found.');
        const { error } = await auth.publicClient.from('menu_item_views').insert({ menu_item_id: id });
        // Tracking is optional until the migration is installed; menu browsing still works.
        if (error) return send(res, { ok: false, trackingAvailable: false });
        viewed.set(key, Date.now() + 30000);
        if (viewed.size > 5000) for (const [key, until] of viewed) if (until < Date.now()) viewed.delete(key);
        return send(res, { ok: true });
      }
      if (method === 'POST' && path === '/api/chat') {
        limit(`chat:${ip}`, 10);
        limit(`chat-hour:${ip}`, 40, 3600000);
        const input = chatSchema.parse(await readBody(req));
        if (input.action === 'chat') useAIQuota();
        const requestId = randomUUID();
        const previous = conversations.read(input.conversationId, input.messages);
        let state = previous;
        const answer = await recommend({
          input, ai, retriever, previous, onState: next => { state = next; },
          onDiagnostic: event => (dependencies.onChatDiagnostic || (entry => console.warn(JSON.stringify(entry))))({ requestId, ...event }),
          getCatalog: async ({ popular }) => {
            const snapshot = await cachedCatalog();
            return { ...snapshot, ...(!popular ? { counts: [], popularityAvailable: false } : {}) };
          },
          restaurant: async ({ memory, questions, language = input.language } = {}) => answerRestaurant({ input: { ...input, language }, knowledge: await knowledge.read(), ai, conversationContext: memory, previousQuestions: questions }),
        });
        // Missing, expired or mismatched context starts a fresh isolated conversation.
        const conversationId = conversations.save(previous ? input.conversationId : undefined, input, answer, state || {});
        return send(res, { ...answer, conversationId, requestId });
      }
      if (method === 'GET' && path === '/api/auth/session') {
        const session = await auth.authenticate(req, res, false);
        return send(res, { user: session?.user || null, isAdmin: session?.isAdmin || false });
      }
      if (method === 'POST' && path === '/api/auth/login') {
        limit(`login:${ip}`, 8);
        const body = z.object({ email: z.string().email().max(254), password: z.string().min(6).max(512) }).parse(await readBody(req));
        const client = auth.makeClient();
        const { data, error } = await client.auth.signInWithPassword(body);
        if (error || !data.session) throw new HttpError(401, 'Invalid email or password.');
        const isAdmin = unwrap(await client.rpc('has_role', { _user_id: data.user.id, _role: 'admin' }));
        if (!isAdmin) throw new HttpError(403, 'Admin access required.');
        auth.save(res, data.session);
        return send(res, { user: { id: data.user.id, email: data.user.email }, isAdmin: true });
      }
      if (method === 'POST' && path === '/api/auth/logout') {
        const session = await auth.authenticate(req, res, false);
        if (session) await session.logout();
        auth.clear(res);
        return send(res, { ok: true });
      }
      if (!path.startsWith('/api/admin/')) throw new HttpError(404, 'API route not found.');
      const { client, user } = await auth.admin(req, res);
      if (method === 'GET' && path === '/api/admin/knowledge') return send(res, await knowledge.read());
      if (method === 'PATCH' && path === '/api/admin/knowledge') {
        const body = knowledgeUpdateSchema.parse(await readBody(req, 160000));
        return send(res, await knowledge.save(body));
      }
      if (method === 'GET' && path === '/api/admin/menu') {
        let items = await allItems(client);
        const search = (url.searchParams.get('search') || '').trim().toLowerCase().slice(0, 200);
        const category = url.searchParams.get('category');
        const badge = url.searchParams.get('badge');
        if (search) items = items.filter(item => `${item.name} ${item.description}`.toLowerCase().includes(search));
        if (category && category !== 'all') items = items.filter(item => item.category_id === category);
        if (badge && badge !== 'all') items = items.filter(item => item.badges?.includes(badge));
        const sort = url.searchParams.get('sort') || 'name';
        items.sort((a, b) => sort === 'price_asc' ? a.price - b.price : sort === 'price_desc' ? b.price - a.price : sort === 'newest' ? b.created_at.localeCompare(a.created_at) : a.name.localeCompare(b.name));
        return send(res, { data: items });
      }
      if (method === 'GET' && path === '/api/admin/categories') return send(res, { data: unwrap(await client.from('categories').select('*').order('display_order')) });
      const itemMatch = path.match(/^\/api\/admin\/menu\/([^/]+)$/);
      if (method === 'POST' && path === '/api/admin/menu' || method === 'PATCH' && itemMatch) {
        const body = itemSchema.parse(await readBody(req));
        let warning;
        const existing = itemMatch ? unwrap(await client.from('menu_items').select('*').eq('id', idSchema.parse(itemMatch[1])).single()) : null;
        if (body.description.trim() && (!existing || existing.description !== body.description) && translationKeys.some(key => !body[key]?.trim())) {
          try {
            useAIQuota();
            const [translations] = await ai.translate([body.description]);
            for (const key of translationKeys) if (!body[key]?.trim()) body[key] = translations[key];
          } catch { warning = 'Auto-translation is unavailable. The item was saved with the supplied descriptions.'; }
        }
        let query = client.from('menu_items');
        query = itemMatch ? query.update(body).eq('id', idSchema.parse(itemMatch[1])) : query.insert(body);
        const data = unwrap(await query.select().single());
        invalidateCatalog();
        return send(res, { data, warning }, itemMatch ? 200 : 201);
      }
      if (method === 'DELETE' && itemMatch) {
        unwrap(await client.from('menu_items').delete().eq('id', idSchema.parse(itemMatch[1])));
        invalidateCatalog(); return send(res, { ok: true });
      }
      if (method === 'POST' && path === '/api/admin/vat') {
        const body = z.object({ ids: z.array(idSchema).min(1).max(1000), vat: z.number().finite().min(0).max(100) }).parse(await readBody(req));
        unwrap(await client.from('menu_items').update({ vat: body.vat }).in('id', body.ids));
        invalidateCatalog(); return send(res, { ok: true });
      }
      const categoryMatch = path.match(/^\/api\/admin\/categories\/([^/]+)$/);
      if (method === 'POST' && path === '/api/admin/categories' || method === 'PATCH' && categoryMatch) {
        const input = await readBody(req);
        const body = categoryMatch ? categorySchema.partial().parse(input) : categorySchema.parse(input);
        if (body.name) body.name = body.name.toLowerCase().replace(/\s+/g, '_');
        let query = client.from('categories');
        query = categoryMatch ? query.update(body).eq('id', idSchema.parse(categoryMatch[1])) : query.insert(body);
        const data = unwrap(await query.select().single());
        invalidateCatalog(); return send(res, { data });
      }
      if (method === 'DELETE' && categoryMatch) {
        unwrap(await client.from('categories').delete().eq('id', idSchema.parse(categoryMatch[1])));
        invalidateCatalog(); return send(res, { ok: true });
      }
      if (method === 'GET' && path === '/api/admin/analytics') {
        const [total, today, views] = await Promise.all([
          client.from('page_views').select('*', { count: 'exact', head: true }),
          // Restaurant reporting day begins at midnight in Vietnam (UTC+7).
          client.from('page_views').select('*', { count: 'exact', head: true }).gte('viewed_at', new Date(Math.floor((Date.now() + 7 * 3600000) / 86400000) * 86400000 - 7 * 3600000).toISOString()),
          countsFor(client),
        ]);
        unwrap(total); unwrap(today);
        const items = await allItems(client);
        return send(res, { totalViews: total.count || 0, todayViews: today.count || 0, trackingAvailable: views.popularityAvailable, topItems: views.counts.sort((a, b) => Number(b.view_count) - Number(a.view_count)).slice(0, 5).map(row => ({ ...row, name: items.find(item => item.id === row.menu_item_id)?.name || 'Deleted dish' })) });
      }
      if (method === 'POST' && path === '/api/admin/translate') {
        limit(`translate:${user.id}`, 10); useAIQuota();
        const body = z.union([z.object({ description: z.string().trim().min(1).max(5000) }), z.object({ descriptions: z.array(z.string().trim().min(1).max(5000)).min(1).max(5) })]).parse(await readBody(req));
        const result = await ai.translate(body.descriptions || [body.description]);
        return send(res, body.descriptions ? { items: result } : result[0]);
      }
      if (method === 'POST' && path === '/api/admin/images') {
        limit(`upload:${user.id}`, 30);
        const bytes = await readBody(req, 15 * 1024 * 1024, true);
        return send(res, await uploadImages(client, bytes), 201);
      }
      const jobMatch = path.match(/^\/api\/admin\/jobs\/([^/]+)$/);
      if (method === 'GET' && jobMatch) {
        const job = jobs.get(jobMatch[1]);
        if (!job || job.owner !== user.id) throw new HttpError(404, 'Job not found.');
        return send(res, job);
      }
      if (method === 'POST' && path === '/api/admin/jobs') {
        const { type } = z.object({ type: z.enum(['optimize', 'auto-fix']) }).parse(await readBody(req));
        for (const [id, job] of jobs) if (Date.now() - job.startedAt > 3600000 && job.status !== 'running') jobs.delete(id);
        if ([...jobs.values()].some(job => job.status === 'running')) throw new HttpError(409, 'A maintenance task is already running.');
        const job = { id: randomUUID(), owner: user.id, type, status: 'running', startedAt: Date.now(), current: 0, total: 0, updated: 0, skipped: 0, errors: [] };
        jobs.set(job.id, job);
        void (async () => {
          try {
            const items = await allItems(client);
            job.total = items.length;
            for (const item of items) {
              let changed = false;
              try {
                if (type === 'auto-fix' && item.description.trim() && translationKeys.some(key => !item[key]?.trim())) {
                  useAIQuota();
                  const [translated] = await ai.translate([item.description]);
                  const update = Object.fromEntries(translationKeys.filter(key => !item[key]?.trim()).map(key => [key, translated[key]]));
                  unwrap(await client.from('menu_items').update(update).eq('id', item.id));
                  changed = true;
                }
              } catch (error) { job.errors.push(`${item.name}: ${error.message}`); }
              try { changed = Boolean(await optimizeItem(client, item, config.supabaseUrl)) || changed; }
              catch (error) { job.errors.push(`${item.name}: ${error.message}`); }
              if (changed) job.updated++; else job.skipped++;
              job.current++;
            }
            job.status = 'complete';
          } catch (error) { job.status = 'failed'; job.errors.push(error.message); }
          finally { invalidateCatalog(); }
        })();
        return send(res, job, 202);
      }
      throw new HttpError(404, 'API route not found.');
    } catch (error) {
      const status = error instanceof z.ZodError ? 400 : error.status || 500;
      if (status === 429) res.setHeader('Retry-After', '60');
      if (status >= 500) console.error('API request failed:', req.method, req.url, error.name);
      if (!res.headersSent) send(res, { error: error instanceof z.ZodError ? error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ') : status === 500 ? 'Something went wrong. Please try again.' : error.message }, status);
      else res.end();
    }
  });
  server.on('listening', () => { void catalogCache.start(); });
  server.on('close', () => catalogCache.stop());
  return server;
}
