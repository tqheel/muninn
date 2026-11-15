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
    // The relay sends a buffer, so the upstream request has a Content-Length.
    assert.ok(Buffer.isBuffer(init.body));
    seen.body = init.body.toString();
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

import { acrcloudUrl } from '../src/server.js';

test('only ACRCloud identify hosts are accepted by the relay', () => {
  assert.equal(acrcloudUrl('identify-us-west-2.acrcloud.com'), 'https://identify-us-west-2.acrcloud.com/v1/identify');
  assert.equal(acrcloudUrl('identify-cn-north-1.acrcloud.cn'), 'https://identify-cn-north-1.acrcloud.cn/v1/identify');
  for (const bad of [null, '', 'example.com', 'identify-x.acrcloud.com.evil.com', 'evil.com/identify-x.acrcloud.com', 'localhost:3000', 'identify-x.acrcloud.com:8080']) {
    assert.equal(acrcloudUrl(bad), null, bad);
  }
});

test('relays ACRCloud requests and refuses other hosts', async () => {
  let seenUrl;
  const fakeFetch = async (url, init) => {
    seenUrl = url;
    for await (const _ of init.body) { /* drain */ }
    return new Response('{"status":{"code":1001}}', { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const server = createServer({ fetchImpl: fakeFetch });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const form = new FormData();
    form.append('access_key', 'k');
    const ok = await fetch(`${base}/api/acrcloud?host=identify-us-west-2.acrcloud.com`, { method: 'POST', body: form });
    assert.equal(ok.status, 200);
    assert.equal(seenUrl, 'https://identify-us-west-2.acrcloud.com/v1/identify');
    seenUrl = null;
    const bad = await fetch(`${base}/api/acrcloud?host=example.com`, { method: 'POST', body: form });
    assert.equal(bad.status, 400);
    assert.equal(seenUrl, null);
  } finally {
    server.close();
  }
});
