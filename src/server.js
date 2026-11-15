// Serves the web app and relays recognition requests to AudD, so the browser
// does not depend on cross-origin access to the service. The relay forwards the
// request body untouched and keeps nothing.

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'web');
const MAX_BODY = 10 * 1024 * 1024;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

export function resolveStatic(urlPath, root = WEB_ROOT) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  const target = path.resolve(root, '.' + (clean === '/' ? '/index.html' : clean));
  return target === root || target.startsWith(root + path.sep) ? target : null;
}

export function createServer({ upstream = 'https://api.audd.io/', fetchImpl = fetch, root = WEB_ROOT } = {}) {
  return http.createServer(async (req, res) => {
    try {
      if (req.url === '/api/health') {
        res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}');
        return;
      }
      if (req.url === '/api/recognize') {
        if (req.method !== 'POST') return void res.writeHead(405).end();
        if (Number(req.headers['content-length'] ?? 0) > MAX_BODY) return void res.writeHead(413).end();
        const upstreamRes = await fetchImpl(upstream, {
          method: 'POST',
          headers: { 'content-type': req.headers['content-type'] ?? 'application/octet-stream' },
          body: Readable.toWeb(req),
          duplex: 'half',
        });
        res.writeHead(upstreamRes.status, { 'content-type': upstreamRes.headers.get('content-type') ?? 'application/json' });
        res.end(Buffer.from(await upstreamRes.arrayBuffer()));
        return;
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return void res.writeHead(405).end();
      const file = resolveStatic(req.url, root);
      if (!file) return void res.writeHead(403).end();
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch (err) {
      if (err.code === 'ENOENT' || err.code === 'EISDIR') return void res.writeHead(404).end('Not found');
      res.writeHead(502, { 'content-type': 'text/plain' }).end(`Relay error: ${err.message}`);
    }
  });
}
