import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import handler from './api.js';
const root = resolve(process.argv.includes('--dist') ? 'dist' : '.');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webp': 'image/webp', '.ttf': 'font/ttf' };
const publicFiles = new Set(['index.html', 'app.js', 'auth.js', 'sync.js', 'family-data.js', 'style.css', 'experiments.json', 'manifest.webmanifest', 'sw.js']);
export function createLocalServer(apiHandler = handler) {
return http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) return apiHandler(req, res);
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); return res.end(); }
  let file;
  try { file = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname).slice(1); }
  catch { res.writeHead(400); return res.end(); }
  if (!publicFiles.has(file) && !/^assets\/[a-zA-Z0-9_.-]+$/.test(file)) { res.writeHead(404); return res.end('Not found'); }
  try {
    const data = await readFile(resolve(root, file));
    res.setHeader('Content-Type', mime[file.slice(file.lastIndexOf('.'))] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch { res.writeHead(404); res.end('Not found'); }
});
}
