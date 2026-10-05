import { validateFamily, MAX_FAMILY_BYTES } from '../family-data.js';
import { createClients, unwrap } from './supabase.js';
import { configuredOrigin } from './config.js';
import { HttpError, digest, publicUser, email, name, password, checkOrigin, readBody } from './security.js';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sessionId(session, userId) {
  // Called only with a session returned by Auth or after getUser() verified its token.
  try {
    const claims = JSON.parse(Buffer.from(session.access_token.split('.')[1], 'base64url').toString());
    if (!uuid.test(claims.session_id) || claims.sub !== userId) throw Error();
    return claims.session_id;
  } catch { throw new HttpError(401, 'Sesi tidak valid. Silakan masuk kembali.'); }
}
async function allowSession(admin, data) {
  if (!data.session || !data.user) throw new HttpError(401, 'Sesi tidak tersedia. Silakan masuk kembali.');
  const allowed = unwrap(await admin.rpc('gkl_allow_session', { p_session: sessionId(data.session, data.user.id), p_user: data.user.id }));
  if (!allowed) throw new HttpError(401, 'Akun tidak aktif atau sesi telah berakhir.');
  return publicUser(data.user);
}
async function authenticated(client, admin) {
  const result = await client.auth.getUser();
  if (result.error) {
    if (result.error.status === 0 || result.error.status >= 500) unwrap(result);
    throw new HttpError(401, 'Sesi berakhir. Silakan masuk kembali.');
  }
  if (!result.data.user) throw new HttpError(401, 'Silakan masuk terlebih dahulu.');
  const { session } = unwrap(await client.auth.getSession());
  const id = sessionId(session, result.data.user.id);
  if (!unwrap(await admin.rpc('gkl_check_session', { p_session: id, p_user: result.data.user.id }))) throw new HttpError(401, 'Sesi berakhir. Silakan masuk kembali.');
  return { user: result.data.user, sessionId: id };
}
async function rateLimit(admin, key, limit) {
  if (!unwrap(await admin.rpc('gkl_rate_limit', { p_key: digest(key), p_limit: limit }))) throw new HttpError(429, 'Terlalu banyak percobaan. Coba lagi dalam 15 menit.');
}
export function createHandler({ clients = createClients, env = process.env } = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const reply = (status, data) => { res.statusCode = status; res.end(JSON.stringify(data)); };
    try {
      const url = new URL(req.url, 'http://localhost');
      const path = url.searchParams.get('route') ? `/api/${url.searchParams.get('route')}` : url.pathname.replace(/\/$/, '');
      const method = req.method;
      if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(method)) throw new HttpError(405, 'Metode tidak didukung.');
      if (method !== 'GET') checkOrigin(req, env);
      const body = method === 'GET' ? {} : await readBody(req, path === '/api/family' ? MAX_FAMILY_BYTES + 1024 : 16384);
      const { client, admin } = clients(req, res, env);
      if (path === '/api/auth/me' && method === 'GET') {
        try { return reply(200, { user: publicUser((await authenticated(client, admin)).user) }); }
        catch (error) { if (error.status === 401) return reply(200, { user: null }); throw error; }
      }
      if (path === '/api/family' && ['GET','POST'].includes(method)) {
        const actor = await authenticated(client, admin);
        if (req.headers['x-gkl-user'] !== actor.user.id) throw new HttpError(401, 'Akun browser berubah. Masuk kembali ke akun pemilik jurnal ini.');
        const params = { p_user: actor.user.id, p_session: actor.sessionId };
        if (method === 'GET') return reply(200, unwrap(await admin.rpc('gkl_read_family', params)));
        if (!Number.isSafeInteger(body.revision) || body.revision < 0) throw new HttpError(400, 'Versi data tidak valid.');
        let data;
        try { data = validateFamily(body.data); } catch (error) { throw new HttpError(400, error.message); }
        const result = unwrap(await admin.rpc('gkl_write_family', { ...params, p_revision: body.revision, p_data: data }));
        return reply(result.conflict ? 409 : 200, result.conflict ? { ...result, error: 'Data berubah di perangkat lain. Pilih versi yang ingin disimpan.' } : result);
      }
      const action = path.match(/^\/api\/auth\/(register|login|forgot-password|verify|reset-password)$/)?.[1];
      if (action && method === 'POST') {
        const ip = env.VERCEL ? String(req.headers['x-vercel-forwarded-for'] || 'unknown').split(',')[0].trim() : req.socket?.remoteAddress || 'local';
        await rateLimit(admin, `${action}:ip:${ip}`, action === 'login' ? 40 : 20);
        if (action === 'verify') {
          if (!['email', 'recovery'].includes(body.type) || typeof body.token !== 'string' || !/^[a-f0-9]{32,128}$/i.test(body.token)) throw new HttpError(400, 'Tautan konfirmasi tidak valid.');
          const result = await client.auth.verifyOtp({ type: body.type, token_hash: body.token });
          if (result.error) {
            if (result.error.status === 0 || result.error.status >= 500 || result.error.status === 429) unwrap(result);
            throw new HttpError(400, 'Tautan tidak valid, sudah digunakan, atau kedaluwarsa. Silakan minta email baru.');
          }
          return reply(200, { user: await allowSession(admin, result.data), recovery: body.type === 'recovery' });
        }
        if (action === 'reset-password') {
          await authenticated(client, admin);
          unwrap(await client.auth.updateUser({ password: password(body.password) }));
          // The database trigger revokes every app grant as part of the password update.
          const result = await client.auth.signOut({ scope: 'global' });
          if (result.error) console.error('Supabase sign-out after reset failed:', result.error.code || 'unavailable');
          return reply(200, { message: 'Password diperbarui. Silakan masuk dengan password baru.' });
        }
        const address = email(body.email);
        await rateLimit(admin, `${action}:email:${address}`, action === 'forgot-password' ? 3 : 10);
        if (action === 'register') {
          // Provision only ordinary, immediately active accounts through the trusted server.
          // Ignore all client-supplied roles, metadata and account status fields.
          unwrap(await admin.auth.admin.createUser({ email: address, password: password(body.password),
            email_confirm: true, user_metadata: { name: name(body.name) }, app_metadata: { gkl_role: 'user' } }));
          return reply(201, { message: 'Akun berhasil dibuat dan langsung aktif. Silakan masuk ke lab.' });
        }
        if (action === 'login') {
          if (typeof body.password !== 'string' || !body.password || body.password.length > 128) throw new HttpError(400, 'Password wajib diisi, maksimal 128 karakter.');
          const result = await client.auth.signInWithPassword({ email: address, password: body.password });
          if (result.error) {
            if (result.error.code === 'email_not_confirmed' || result.error.status === 429 || result.error.status === 0 || result.error.status >= 500) unwrap(result);
            throw new HttpError(401, 'Email atau password salah, atau akun tidak aktif.');
          }
          return reply(200, { user: await allowSession(admin, result.data) });
        }
        unwrap(await client.auth.resetPasswordForEmail(address, { redirectTo: configuredOrigin(env, 'APP_URL') }));
        return reply(200, { message: 'Jika email terdaftar dan aktif, tautan reset password akan dikirim. Periksa juga folder spam.' });
      }
      if (path === '/api/auth/logout' && method === 'POST') {
        try {
          const actor = await authenticated(client, admin);
          unwrap(await admin.rpc('gkl_revoke_session', { p_session: actor.sessionId }));
        } catch (error) { if (error.status !== 401) throw error; }
        unwrap(await client.auth.signOut({ scope: 'local' }));
        return reply(200, { message: 'Anda sudah keluar.' });
      }
      if (path.startsWith('/api/admin/')) {
        const actor = (await authenticated(client, admin)).user;
        if (publicUser(actor).role !== 'admin') throw new HttpError(403, 'Halaman ini hanya untuk administrator.');
        if (path === '/api/admin/users' && method === 'GET') {
          const page = Math.max(1, Math.min(100000, Number.parseInt(url.searchParams.get('page'), 10) || 1));
          const role = url.searchParams.get('role') || 'all', status = url.searchParams.get('status') || 'all', sort = url.searchParams.get('sort') || 'newest';
          if (!['all', 'user', 'admin'].includes(role) || !['all', 'active', 'inactive'].includes(status) || !['newest', 'oldest', 'name'].includes(sort)) {
            throw new HttpError(400, 'Filter atau urutan pengguna tidak valid.');
          }
          const result = await admin.rpc('gkl_search_users', {
            p_query: (url.searchParams.get('q') || '').trim().slice(0, 100), p_page: page, p_role: role, p_status: status, p_sort: sort,
          });
          if (result.error?.code === 'PGRST202') throw new HttpError(503, 'Pembaruan database admin belum diterapkan. Hubungi pengelola aplikasi.');
          return reply(200, unwrap(result));
        }
        if (path === '/api/admin/users' && method === 'POST') {
          if (!['user', 'admin'].includes(body.role)) throw new HttpError(400, 'Peran tidak valid.');
          const data = unwrap(await admin.auth.admin.createUser({ email: email(body.email), password: password(body.password),
            email_confirm: true, user_metadata: { name: name(body.name) }, app_metadata: { gkl_role: body.role } }));
          return reply(201, { user: publicUser(data.user) });
        }
        const id = path.match(/^\/api\/admin\/users\/([^/]+)$/)?.[1];
        if (id && uuid.test(id) && ['PATCH', 'DELETE'].includes(method)) {
          const result = await admin.auth.admin.getUserById(id);
          if (result.error?.status === 404) throw new HttpError(404, 'Pengguna tidak ditemukan.');
          const target = publicUser(unwrap(result).user);
          const next = method === 'PATCH' ? { name: name(body.name), email: email(body.email), role: body.role, active: body.active } : null;
          if (next && (!['user', 'admin'].includes(next.role) || typeof next.active !== 'boolean')) throw new HttpError(400, 'Peran atau status tidak valid.');
          if (id === actor.id && (!next || !next.active || next.role !== 'admin')) throw new HttpError(400, 'Anda tidak dapat menghapus, menonaktifkan, atau menurunkan peran akun sendiri.');
          if (target.role === 'admin' && target.active && (!next || !next.active || next.role !== 'admin')) {
            const directory = unwrap(await admin.rpc('gkl_list_users', { p_query: '', p_page: 1 }));
            if (directory.stats.admins <= 1) throw new HttpError(400, 'Minimal satu administrator aktif harus tersedia.');
          }
          // The database trigger additionally protects the last admin under concurrent requests.
          if (!next) {
            if (typeof body.confirmEmail !== 'string' || body.confirmEmail.trim().toLowerCase() !== target.email.toLowerCase()) {
              throw new HttpError(400, 'Ketik alamat email pengguna dengan tepat untuk mengonfirmasi penghapusan.');
            }
            unwrap(await admin.auth.admin.deleteUser(id));
            return reply(200, { user: null, message: 'Pengguna dihapus.' });
          }
          const data = unwrap(await admin.auth.admin.updateUserById(id, { email: next.email,
            user_metadata: { name: next.name }, app_metadata: { gkl_role: next.role },
            // Avoid rewriting banned_until when only the name changes.
            ...(next.active !== target.active ? { ban_duration: next.active ? 'none' : '876000h' } : {}) }));
          return reply(200, { user: publicUser(data.user), message: 'Pengguna diperbarui.' });
        }
      }
      throw new HttpError(404, 'Endpoint tidak ditemukan.');
    } catch (error) {
      if (error.status) return reply(error.status, { error: error.message });
      console.error('API error:', error.code || error.name);
      return reply(503, { error: 'Layanan belum tersedia. Periksa konfigurasi Supabase atau coba lagi nanti.' });
    }
  };
}
export default createHandler();
