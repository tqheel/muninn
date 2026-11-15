import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, resolveStatic } from '../src/server.js';

test('static paths cannot escape the web folder', () => {
  assert.equal(resolveStatic('/../package.json'), null);
  assert.equal(resolveStatic('/%2e%2e/package.json'), null);
  assert.match(resolveStatic('/'), /web[\\/]index\.html$/);
  assert.match(resolveStatic('/app.js?x=1'), /web[\\/]app\.js$/);
});

async function withServer(opts, fn) {
  const server = createServer(opts);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.close();
  }
}

test('serves the page, health, 404 and rejects traversal', async () => {
  await withServer({}, async (base) => {
    const page = await fetch(`${base}/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /muninn/);
    assert.equal((await fetch(`${base}/api/health`)).status, 200);
    assert.equal((await fetch(`${base}/nope.js`)).status, 404);
    assert.equal((await fetch(`${base}/api/recognize`)).status, 405);
  });
});

test('relays recognition requests untouched', async () => {
  let seen;
  const upstreamFetch = async (url, init) => {
    seen = { url, type: init.headers['content-type'] };
    const chunks = [];
    for await (const c of init.body) chunks.push(c);
    seen.body = Buffer.concat(chunks).toString();
    return new Response('{"status":"success","result":null}', { status: 200, headers: { 'content-type': 'application/json' } });
  };
  await withServer({ upstream: 'http://upstream.test/', fetchImpl: upstreamFetch }, async (base) => {
    const form = new FormData();
    form.append('api_token', 'secret');
    const res = await fetch(`${base}/api/recognize`, { method: 'POST', body: form });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).status, 'success');
  });
  assert.equal(seen.url, 'http://upstream.test/');
  assert.match(seen.type, /multipart\/form-data/);
  assert.match(seen.body, /secret/);
});
