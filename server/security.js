import { createHash } from 'node:crypto';
import { configuredOrigin } from './config.js';
export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const digest = value => createHash('sha256').update(value).digest('hex');
export const publicUser = u => ({ id: u.id, name: u.user_metadata?.name || u.email?.split('@')[0] || 'Pengguna', email: u.email, role: u.app_metadata?.gkl_role === 'admin' ? 'admin' : 'user', active: !u.banned_until || new Date(u.banned_until) <= new Date(), createdAt: u.created_at });
export function email(value) {
  if (typeof value !== 'string') throw new HttpError(400, 'Alamat email tidak valid.');
  const result = value.trim().toLowerCase();
  if (result.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw new HttpError(400, 'Alamat email tidak valid.');
  return result;
}
export function name(value) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 80) throw new HttpError(400, 'Nama wajib diisi, maksimal 80 karakter.');
  return value.trim();
}
export function password(value) {
  if (typeof value !== 'string' || value.length < 12 || value.length > 128) throw new HttpError(400, 'Password harus terdiri dari 12–128 karakter.');
  return value;
}
export function checkOrigin(req, env) {
  if (req.headers.origin !== configuredOrigin(env, 'APP_URL')) throw new HttpError(403, 'Asal permintaan tidak diizinkan.');
  if (req.headers['x-requested-with'] !== 'GeniusKidsLab') throw new HttpError(403, 'Permintaan tidak diizinkan.');
}
export async function readBody(req, maxBytes = 16384) {
  if (!(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) throw new HttpError(415, 'Gunakan JSON.');
  let raw = '';
  if (req.body !== undefined) raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  else {
    const chunks = []; let bytes = 0;
    for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); bytes += buffer.length;
      if (bytes > maxBytes) throw new HttpError(413, 'Permintaan terlalu besar.');
      chunks.push(buffer);
    }
    raw = Buffer.concat(chunks).toString('utf8');
  }
  if (Buffer.byteLength(raw) > maxBytes) throw new HttpError(413, 'Permintaan terlalu besar.');
  try {
    const body = JSON.parse(raw || '{}');
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw Error();
    return body;
  } catch { throw new HttpError(400, 'JSON tidak valid.'); }
}
