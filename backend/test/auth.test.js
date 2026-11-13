import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuth } from '../src/auth.js';

const config = { production: false, supabaseUrl: 'https://example.supabase.co', supabaseKey: 'anon-key', sessionSecret: 'a-long-secret-used-only-in-unit-tests' };
const id = 'f21495cb-5b3c-424c-9c20-6513b633f8fd';
function response() { return { headers: {}, setHeader(name, value) { this.headers[name] = value; } }; }
function cookieFor(auth, session) { const res = response(); auth.save(res, session); return res.headers['Set-Cookie'].split(';')[0]; }

test('verifies admin roles on the server and isolates concurrent users’ Supabase tokens', async () => {
  const calls = [];
  const auth = createAuth(config, async (url, options) => {
    const token = new Headers(options.headers).get('Authorization');
    calls.push({ url, token });
    if (url.endsWith('/user')) return Response.json({ id, email: token.includes('admin-access') ? 'admin@example.com' : 'guest@example.com' });
    if (url.endsWith('/rpc/has_role')) return Response.json(token.includes('admin-access'));
    throw new Error('Unexpected endpoint');
  });
  const adminCookie = cookieFor(auth, { access_token: 'admin-access', refresh_token: 'r1', expires_at: 9999999999 });
  const guestCookie = cookieFor(auth, { access_token: 'guest-access', refresh_token: 'r2', expires_at: 9999999999 });
  const [admin, guest] = await Promise.all([
    auth.authenticate({ headers: { cookie: adminCookie } }, response()),
    auth.authenticate({ headers: { cookie: guestCookie } }, response()),
  ]);
  assert.equal(admin.isAdmin, true);
  assert.equal(guest.isAdmin, false);
  assert.equal(admin.user.email, 'admin@example.com');
  assert.equal(guest.user.email, 'guest@example.com');
  assert.equal(calls.filter(call => call.url.endsWith('/user')).length, 2);
  assert.equal(calls.filter(call => call.url.endsWith('/rpc/has_role') && call.token === 'Bearer admin-access').length, 1);
  await assert.rejects(() => auth.admin({ headers: { cookie: guestCookie } }, response()), error => error.status === 403);
});
test('refreshes expiring sessions into a new encrypted cookie and logs out with the verified access token', async () => {
  const calls = [];
  const auth = createAuth(config, async (url, options) => {
    calls.push({ url, options });
    if (url.includes('/token?grant_type=refresh_token')) return Response.json({ access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 3600, token_type: 'bearer', user: { id, email: 'admin@example.com' } });
    if (url.endsWith('/user')) return Response.json({ id, email: 'admin@example.com' });
    if (url.endsWith('/rpc/has_role')) return Response.json(true);
    if (url.endsWith('/logout?scope=local')) return new Response(null, { status: 204 });
    throw new Error('Unexpected endpoint');
  });
  const cookie = cookieFor(auth, { access_token: 'old-access', refresh_token: 'old-refresh', expires_at: 1 });
  const res = response();
  const session = await auth.authenticate({ headers: { cookie } }, res);
  assert.equal(session.isAdmin, true);
  assert.match(res.headers['Set-Cookie'], /HttpOnly/);
  assert.ok(!res.headers['Set-Cookie'].includes('new-access'));
  await session.logout();
  const logout = calls.find(call => call.url.endsWith('/logout?scope=local'));
  assert.equal(new Headers(logout.options.headers).get('Authorization'), 'Bearer new-access');
});
test('production session cookies enforce the secure host prefix', () => {
  const auth = createAuth({ ...config, production: true });
  const cookie = cookieFor(auth, { access_token: 'access', refresh_token: 'refresh', expires_at: 9999999999 });
  assert.match(cookie, /^__Host-menu_session=/);
  const res = response(); auth.clear(res);
  assert.match(res.headers['Set-Cookie'], /Secure/);
  assert.match(res.headers['Set-Cookie'], /Max-Age=0/);
});
