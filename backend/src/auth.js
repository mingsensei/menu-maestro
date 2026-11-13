import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { HttpError } from './errors.js';

export function createAuth(config, fetcher = fetch) {
  const key = createHash('sha256').update(config.sessionSecret).digest();
  const makeClient = token => createClient(config.supabaseUrl, config.supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}), fetch: (url, options) => fetcher(url, { ...options, signal: options?.signal || AbortSignal.timeout(20000) }) },
  });
  const publicClient = makeClient();
  const cookieName = config.production ? '__Host-menu_session' : 'menu_session';
  const cookie = (res, value, maxAge) => res.setHeader('Set-Cookie', `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${config.production ? '; Secure' : ''}`);
  const clear = res => cookie(res, '', 0);
  const save = (res, session) => {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, nonce);
    const value = Buffer.concat([cipher.update(JSON.stringify({ access_token: session.access_token, refresh_token: session.refresh_token, expires_at: session.expires_at })), cipher.final()]);
    cookie(res, Buffer.concat([nonce, cipher.getAuthTag(), value]).toString('base64url'), 60 * 60 * 24 * 7);
  };
  const read = req => {
    const value = req.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
    if (!value || value.length > 10000) return null;
    try {
      const bytes = Buffer.from(value, 'base64url');
      const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
      decipher.setAuthTag(bytes.subarray(12, 28));
      return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString());
    } catch { return null; }
  };
  const authenticate = async (req, res, required = true) => {
    let session = read(req);
    if (!session) {
      if (required) throw new HttpError(401, 'Please sign in.');
      return null;
    }
    if (session.expires_at * 1000 < Date.now() + 30000) {
      const { data, error } = await makeClient().auth.refreshSession({ refresh_token: session.refresh_token });
      if (error || !data.session) { clear(res); if (required) throw new HttpError(401, 'Your session expired. Please sign in.'); return null; }
      session = data.session;
      save(res, session);
    }
    const client = makeClient(session.access_token);
    const { data, error } = await client.auth.getUser(session.access_token);
    if (error || !data.user) { clear(res); if (required) throw new HttpError(401, 'Please sign in again.'); return null; }
    const { data: isAdmin, error: roleError } = await client.rpc('has_role', { _user_id: data.user.id, _role: 'admin' });
    if (roleError) throw new HttpError(502, 'Unable to verify account permissions.');
    return { client, user: { id: data.user.id, email: data.user.email }, isAdmin: isAdmin === true, logout: () => client.auth.admin.signOut(session.access_token, 'local') };
  };
  const admin = async (req, res) => {
    const result = await authenticate(req, res);
    if (!result.isAdmin) throw new HttpError(403, 'Admin access required.');
    return result;
  };
  return { makeClient, publicClient, save, clear, authenticate, admin };
}
