import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { createServerClient, parseCookieHeader, serializeCookieHeader } from '@supabase/ssr';
import { HttpError } from './security.js';
import { configuredOrigin, envValue, requiredKey } from './config.js';

export function createAdminClient(env = process.env) {
  const url = configuredOrigin(env, 'SUPABASE_URL');
  const secret = requiredKey(env, 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}
export function createClients(req, res, env = process.env) {
  const url = configuredOrigin(env, 'SUPABASE_URL');
  const key = requiredKey(env, 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_ANON_KEY');
  const jar = new Map(parseCookieHeader(req.headers.cookie || '').map(({ name, value }) => [name, value]));
  const pending = new Map();
  const client = createServerClient(url, key, {
    cookieOptions: { name: 'gkl-supabase-auth', path: '/', httpOnly: true, sameSite: 'lax',
      secure: !!(env.NODE_ENV === 'production' || env.VERCEL || envValue(env, 'APP_URL').startsWith('https://')) },
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll(cookies) {
        for (const { name, value, options } of cookies) {
          jar.set(name, value);
          pending.set(name, serializeCookieHeader(name, value, options));
        }
        res.setHeader('Set-Cookie', [...pending.values()]);
      },
    },
  });
  return { client, admin: createAdminClient(env) };
}
export function unwrap(result) {
  if (!result.error) return result.data;
  const error = result.error;
  if (error.message?.includes('gkl_session_denied')) throw new HttpError(401, 'Sesi berakhir. Silakan masuk kembali.');
  if (error.message?.includes('gkl_invalid_family')) throw new HttpError(400, 'Data keluarga tidak valid.');
  if (error.status === 429) throw new HttpError(429, 'Terlalu banyak percobaan. Coba lagi beberapa saat.');
  if (error.code === 'email_not_confirmed') throw new HttpError(401, 'Konfirmasi email Anda terlebih dahulu melalui tautan yang dikirim Supabase.');
  if (['user_already_exists', 'email_exists'].includes(error.code)) throw new HttpError(409, 'Email sudah digunakan.');
  if (error.message?.includes('gkl_last_admin')) throw new HttpError(400, 'Minimal satu administrator aktif harus tersedia.');
  if (error.status >= 500 || !error.status) {
    console.error('Supabase request failed:', error.code || 'unavailable');
    throw new HttpError(503, 'Layanan Supabase belum tersedia. Periksa konfigurasi atau coba lagi nanti.');
  }
  throw new HttpError(400, 'Permintaan tidak dapat diproses. Periksa data atau masa berlaku tautan Anda.');
}
