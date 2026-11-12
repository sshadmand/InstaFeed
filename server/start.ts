import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { handler as account } from '../api/account.js';
import { handler as platform } from '../api/platform.js';
import { handler as feedback } from '../api/feedback.js';
import { migrate, pool } from './db.js';

if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL before starting InstaFeed.');
if (process.env.NODE_ENV === 'production' && !process.env.APP_URL) throw new Error('Set APP_URL to this deployment’s public HTTPS origin.');
await migrate();
const root = resolve('dist');
const mime: Record<string,string> = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.ico':'image/x-icon' };
const routes: Record<string,(req: Request) => Promise<Response>> = { '/api/account': account, '/api/platform': platform, '/api/feedback': feedback };
const server = createServer(async (req,res) => {
  try {
    const base = process.env.APP_URL || `http://${req.headers.host}`;
    const url = new URL(req.url || '/', base);
    res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('Referrer-Policy','same-origin');
    if (routes[url.pathname]) {
      const headers = new Headers();
      for (const [key,value] of Object.entries(req.headers)) if (value) headers.set(key, Array.isArray(value) ? value.join(',') : value);
      // Trust proxy IP headers only when the operator explicitly opts in behind a trusted proxy.
      if (process.env.TRUST_PROXY !== 'true') headers.set('x-forwarded-for', req.socket.remoteAddress ?? 'unknown');
      const request = new Request(url, { method: req.method, headers, ...(req.method !== 'GET' && req.method !== 'HEAD' ? { body: Readable.toWeb(req) as ReadableStream<Uint8Array>, duplex: 'half' } : {}) } as RequestInit);
      const response = await routes[url.pathname](request);
      res.writeHead(response.status,Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer())); return;
    }
    if (!['GET','HEAD'].includes(req.method ?? '')) { res.writeHead(405); res.end(); return; }
    const path = resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!path.startsWith(root + '/')) { res.writeHead(403); res.end(); return; }
    try { const file = await readFile(path); res.writeHead(200,{ 'Content-Type': mime[extname(path)] ?? 'application/octet-stream', 'Cache-Control': path.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache' }); res.end(req.method === 'HEAD' ? undefined : file); }
    catch { res.writeHead(404); res.end('Page not found.'); }
  } catch (error) { console.error(error); res.writeHead(500); res.end('Request failed.'); }
});
server.listen(Number(process.env.PORT || 3000), '0.0.0.0', () => console.info(`InstaFeed listening on port ${process.env.PORT || 3000}`));
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => { server.close(() => { void pool.end().then(() => process.exit(0)); }); });
