/**
 * Local preview of dist/ with the same server code as production.
 *   npm run preview                         static preview + /data/competition.json from dist
 *   MINHO11_DEV_SOURCE=data/dev-source.xlsx  also serves /api/admin against a LOCAL COPY of the workbook
 * Admin credentials for local use come from .env (git-ignored): ADMIN_PASSWORD_HASH, ADMIN_SESSION_SECRET.
 */
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const repo = fileURLToPath(new URL('../', import.meta.url));
const root = path.resolve(repo, 'dist');
const port = Number(process.env.PORT || 4173);
try { for (const line of (await fs.readFile(path.join(repo, '.env'), 'utf8')).split('\n')) { const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim()); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2]; } } catch { /* no .env */ }
let api = null;
if (process.env.MINHO11_DEV_SOURCE) {
  const sourceFile = path.resolve(repo, process.env.MINHO11_DEV_SOURCE);
  if (sourceFile === path.resolve(repo, 'data/source.xlsx')) throw new Error('Usa uma CÓPIA (ex.: data/dev-source.xlsx), nunca data/source.xlsx.');
  const { appFromEnv } = await import('../server/runtime.js');
  const { FileStorage } = await import('../server/storage.js');
  api = appFromEnv({ env: process.env, storage: new FileStorage(path.join(repo, 'data/internal/dev-store')), sourceFile, log: console.log });
  console.log(`MINHO11: gestão local ativa sobre ${path.relative(repo, sourceFile)}`);
}
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.xml': 'application/xml', '.txt': 'text/plain' };
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${port}`);
    if (api && (url.pathname.startsWith('/api/admin/') || url.pathname === '/data/competition.json')) {
      const chunks = []; for await (const c of req) chunks.push(c);
      // Local HTTP: present the request as https so Secure cookies and Origin checks behave as in production.
      const headers = new Headers(Object.entries(req.headers).filter(([, v]) => typeof v === 'string'));
      if (headers.get('origin') === `http://127.0.0.1:${port}`) headers.set('origin', `https://127.0.0.1:${port}`);
      const response = await api(new Request(`https://127.0.0.1:${port}${url.pathname}${url.search}`, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) }));
      const out = Object.fromEntries(response.headers);
      if (out['set-cookie']) out['set-cookie'] = out['set-cookie'].replace('; Secure', '');
      res.writeHead(response.status, out); res.end(Buffer.from(await response.arrayBuffer())); return;
    }
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return; }
    const pathname = decodeURIComponent(url.pathname);
    let file = path.resolve(root, '.' + pathname);
    if ((file !== root && !file.startsWith(root + path.sep)) || pathname.split('/').some(part => part.startsWith('.'))) { res.writeHead(403); res.end(); return; }
    try { if ((await fs.stat(file)).isDirectory()) file = path.join(file, 'index.html'); } catch { /* Serve 404 below. */ }
    let content, status = 200;
    try { content = await fs.readFile(file); } catch { content = await fs.readFile(path.join(root, '404.html')); status = 404; file = '404.html'; }
    res.writeHead(status, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin' });
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch (error) { console.error(error); res.writeHead(500); res.end('Erro interno.'); }
});
server.listen(port, '127.0.0.1', () => console.log(`MINHO11: http://127.0.0.1:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
