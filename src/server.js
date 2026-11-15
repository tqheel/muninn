// Serves the web app and relays recognition requests to AudD or ACRCloud, so the
// browser does not depend on cross-origin access to the service. The relay forwards
// the request body untouched and keeps nothing. It only forwards to those two services.

import http from 'node:http';
import { readFile } from 'node:fs/promises';
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

const ACRCLOUD_HOST = /^identify-[a-z0-9-]+\.acrcloud\.(com|cn)$/;

export function acrcloudUrl(host) {
  return ACRCLOUD_HOST.test(host ?? '') ? `https://${host}/v1/identify` : null;
}

async function relay(req, res, target, fetchImpl) {
  if (req.method !== 'POST') return void res.writeHead(405).end();
  if (Number(req.headers['content-length'] ?? 0) > MAX_BODY) return void res.writeHead(413).end();
  // Buffered so the upstream request carries a Content-Length. Some services
  // (ACRCloud) reject a chunked upload as "Invalid http content type".
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) return void res.writeHead(413).end();
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks);
  const upstreamRes = await fetchImpl(target, {
    method: 'POST',
    headers: { 'content-type': req.headers['content-type'] ?? 'application/octet-stream' },
    body,
  });
  res.writeHead(upstreamRes.status, { 'content-type': upstreamRes.headers.get('content-type') ?? 'application/json' });
  res.end(Buffer.from(await upstreamRes.arrayBuffer()));
}

export function createServer({ upstream = 'https://api.audd.io/', acrcloudBase = null, fetchImpl = fetch, root = WEB_ROOT } = {}) {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/api/health') {
        res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}');
        return;
      }
      if (url.pathname === '/api/recognize') return await relay(req, res, upstream, fetchImpl);
      if (url.pathname === '/api/acrcloud') {
        const host = url.searchParams.get('host');
        const target = acrcloudBase && acrcloudUrl(host) ? `${acrcloudBase}/${host}` : acrcloudUrl(host);
        if (!target) return void res.writeHead(400, { 'content-type': 'text/plain' }).end('Not an ACRCloud host');
        return await relay(req, res, target, fetchImpl);
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
