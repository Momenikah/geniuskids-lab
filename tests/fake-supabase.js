// HTTP contract double. Real Supabase SDKs call this fixture; never used by production.
import http from 'node:http';
import { randomUUID, randomBytes } from 'node:crypto';
import { digest } from '../server/security.js';
import { testDatabase } from './database.js';
export async function fakeSupabase({ confirmEmail = false, appUrl = 'http://localhost:5173' } = {}) {
  const db = await testDatabase(), outbox = [], tokens = new Map(), refreshes = new Map(), otps = new Map();
  const userById = async id => (await db.query('SELECT * FROM auth.users WHERE id=$1', [id])).rows[0];
  const userByEmail = async email => (await db.query('SELECT * FROM auth.users WHERE email=$1', [email])).rows[0];
  const shape = u => ({ id: u.id, email: u.email, role: 'authenticated', aud: 'authenticated', app_metadata: u.raw_app_meta_data, user_metadata: u.raw_user_meta_data, created_at: u.created_at, banned_until: u.banned_until, email_confirmed_at: u.email_confirmed_at, identities: [{ id: u.id, provider: 'email' }] });
  async function createUser(values, confirmed = true) {
    const id = randomUUID();
    await db.query('INSERT INTO auth.users(id,email,encrypted_password,raw_user_meta_data,raw_app_meta_data,email_confirmed_at) VALUES($1,$2,$3,$4,$5,$6)', [id, values.email, digest(values.password), values.user_metadata || values.data || {}, values.app_metadata || { gkl_role: 'user' }, confirmed ? new Date().toISOString() : null]);
    return userById(id);
  }
  async function session(user, sid = randomUUID()) {
    await db.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [sid, user.id]);
    const access = [Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'), Buffer.from(JSON.stringify({ sub: user.id, session_id: sid, exp: Math.floor(Date.now()/1000)+3600, iat: Math.floor(Date.now()/1000), app_metadata: user.raw_app_meta_data })).toString('base64url'), randomBytes(32).toString('base64url')].join('.');
    const refresh = randomBytes(32).toString('hex');
    tokens.set(access, { userId: user.id, sid }); refreshes.set(refresh, { userId: user.id, sid });
    return { access_token: access, refresh_token: refresh, expires_in: 3600, token_type: 'bearer', user: shape(user) };
  }
  function sendEmail(user, type) {
    const token = randomBytes(32).toString('hex');
    otps.set(token, { userId: user.id, type, expires: Date.now()+1800000 });
    outbox.push({ email: user.email, url: `${appUrl}/#auth-confirm/${type}/${token}`, token, type });
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('X-Supabase-Api-Version', '2024-01-01');
    const reply = (status, data = {}) => { res.statusCode=status; res.end(JSON.stringify(data)); };
    try {
      const url = new URL(req.url, 'http://localhost'), path = url.pathname;
      let text = ''; for await (const chunk of req) text += chunk;
      const body = text ? JSON.parse(text) : {};
      const service = req.headers.apikey === 'test-service-key';
      if (path.startsWith('/rest/v1/rpc/')) {
        if (!service) return reply(403, { message: 'forbidden', code: '42501' });
        const rpc = path.split('/').pop();
        const argumentsByName = { gkl_search_users: ['p_query','p_page','p_role','p_status','p_sort'], gkl_read_family: ['p_user','p_session'], gkl_write_family: ['p_user','p_session','p_revision','p_data'], gkl_rate_limit: ['p_key','p_limit'], gkl_allow_session: ['p_session','p_user'], gkl_check_session: ['p_session','p_user'], gkl_revoke_session: ['p_session'], gkl_list_users: ['p_query','p_page'] };
        if (!argumentsByName[rpc]) return reply(404);
        const args = argumentsByName[rpc].map(key => body[key]);
        const result = await db.query(`SELECT public.${rpc}(${args.map((_,i)=>`$${i+1}`).join(',')}) AS result`, args);
        return reply(200, result.rows[0].result);
      }
      const bearer = String(req.headers.authorization || '').replace(/^Bearer /, '');
      const stored = tokens.get(bearer), user = stored && await userById(stored.userId);
      const liveSession = stored && (await db.query('SELECT 1 FROM auth.sessions WHERE id=$1', [stored.sid])).rows.length;
      const valid = user && liveSession && (!user.banned_until || new Date(user.banned_until) <= new Date());
      if (path === '/auth/v1/signup') {
        if (await userByEmail(body.email)) return reply(422, { code: 'user_already_exists', msg: 'exists' });
        const created = await createUser({ ...body, app_metadata: {} }, !confirmEmail);
        if (confirmEmail) { sendEmail(created, 'email'); return reply(200, shape(created)); }
        return reply(200, await session(created));
      }
      if (path === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password') {
        const found = await userByEmail(body.email);
        if (!found || found.encrypted_password !== digest(body.password) || (found.banned_until && new Date(found.banned_until) > new Date())) return reply(400, { code: 'invalid_credentials', msg: 'Invalid credentials' });
        if (!found.email_confirmed_at) return reply(400, { code: 'email_not_confirmed', msg: 'Email not confirmed' });
        return reply(200, await session(found));
      }
      if (path === '/auth/v1/token' && url.searchParams.get('grant_type') === 'refresh_token') {
        const previous = refreshes.get(body.refresh_token);
        if (!previous || !(await db.query('SELECT 1 FROM auth.sessions WHERE id=$1', [previous.sid])).rows.length) return reply(400, { code:'refresh_token_not_found', msg:'Expired' });
        refreshes.delete(body.refresh_token);
        return reply(200, await session(await userById(previous.userId), previous.sid));
      }
      if (path === '/auth/v1/recover') {
        const found = await userByEmail(body.email);
        if (found) sendEmail(found, 'recovery');
        return reply(200);
      }
      if (path === '/auth/v1/verify') {
        const otp = otps.get(body.token_hash);
        if (!otp || otp.type !== body.type || otp.expires < Date.now()) return reply(403, { code: 'otp_expired', msg: 'Invalid OTP' });
        otps.delete(body.token_hash);
        await db.query('UPDATE auth.users SET email_confirmed_at=now() WHERE id=$1', [otp.userId]);
        return reply(200, await session(await userById(otp.userId)));
      }
      if (path === '/auth/v1/user') {
        if (!valid) return reply(401, { code: 'bad_jwt', msg: 'Invalid token' });
        if (req.method === 'PUT') {
          if (body.password) await db.query('UPDATE auth.users SET encrypted_password=$1 WHERE id=$2', [digest(body.password),user.id]);
          return reply(200, shape(await userById(user.id)));
        }
        return reply(200, shape(user));
      }
      if (path === '/auth/v1/logout') {
        if (stored) {
          if (url.searchParams.get('scope') === 'global') await db.query('DELETE FROM auth.sessions WHERE user_id=$1',[stored.userId]);
          else await db.query('DELETE FROM auth.sessions WHERE id=$1',[stored.sid]);
        }
        res.statusCode=204; return res.end();
      }
      if (path.startsWith('/auth/v1/admin/users')) {
        if (!service) return reply(403, { msg: 'Forbidden' });
        const id = path.split('/')[5];
        if (!id && req.method === 'POST') {
          if (await userByEmail(body.email)) return reply(422, { code: 'email_exists', msg: 'exists' });
          return reply(200, shape(await createUser(body, body.email_confirm === true)));
        }
        const target = await userById(id);
        if (!target) return reply(404, { msg: 'User not found' });
        if (req.method === 'DELETE') { await db.query('DELETE FROM auth.users WHERE id=$1',[id]); return reply(200, shape(target)); }
        if (req.method === 'PUT') {
          await db.query('UPDATE auth.users SET email=$1,raw_user_meta_data=$2,raw_app_meta_data=$3,banned_until=$4 WHERE id=$5', [body.email || target.email, { ...target.raw_user_meta_data, ...body.user_metadata }, { ...target.raw_app_meta_data, ...body.app_metadata }, body.ban_duration === 'none' ? null : body.ban_duration ? '2126-01-01T00:00:00Z' : target.banned_until, id]);
          return reply(200, shape(await userById(id)));
        }
        return reply(200, shape(target));
      }
      return reply(404, { msg: `Unimplemented test endpoint: ${path}` });
    } catch (error) { reply(500, { message: error.message, msg: error.message, code: error.code || 'test_error' }); }
  });
  await new Promise((resolve,reject) => { server.once('error',reject); server.listen(0,'127.0.0.1',resolve); });
  return { db, outbox, otps, createUser, sendEmail, tokens, refreshes, setConfirmEmail(value) { confirmEmail = value; },
    env: { SUPABASE_URL: `http://127.0.0.1:${server.address().port}`, SUPABASE_PUBLISHABLE_KEY: 'test-anon-key', SUPABASE_SECRET_KEY: 'test-service-key', APP_URL: appUrl },
    async close() { await new Promise(resolve=>server.close(resolve)); await db.end(); },
  };
}
