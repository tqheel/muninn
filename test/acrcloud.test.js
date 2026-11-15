import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { signRequest, parseACRCloud, recognizeACRCloud, normalizeHost } from '../web/acrcloud.js';
import { createRecognizer, isConfigured, providerOf } from '../web/providers.js';

test('signature matches an independent HMAC-SHA1 of the documented string', async () => {
  const expected = createHmac('sha1', 'secret')
    .update('POST\n/v1/identify\nkey123\naudio\n1\n1579408708')
    .digest('base64');
  assert.equal(await signRequest({ accessKey: 'key123', accessSecret: 'secret', timestamp: '1579408708' }), expected);
});

test('signing needs a secure context', async () => {
  await assert.rejects(signRequest({ accessKey: 'k', accessSecret: 's', timestamp: '1', cryptoImpl: {} }), /secure page/);
});

test('cleans up the host', () => {
  assert.equal(normalizeHost(' https://identify-us-west-2.acrcloud.com/v1/identify '), 'identify-us-west-2.acrcloud.com');
});

const MATCH = {
  status: { code: 0, msg: 'Success' },
  metadata: { music: [{
    title: 'Cross Road Blues', score: 100, play_offset_ms: 42000, release_date: '1990-09-08',
    artists: [{ name: 'Robert Johnson' }], album: { name: 'The Complete Recordings' },
  }] },
};

test('parses a match, turning the end offset into a clip start position', () => {
  const r = parseACRCloud(MATCH, 12);
  assert.deepEqual(
    [r.status, r.title, r.artist, r.album, r.releaseDate, r.positionSeconds, r.artUrl],
    ['match', 'Cross Road Blues', 'Robert Johnson', 'The Complete Recordings', '1990-09-08', 30, null],
  );
  assert.equal(parseACRCloud(MATCH, 100).positionSeconds, 0); // never negative
});

test('joins several artists and tolerates a missing offset', () => {
  const r = parseACRCloud({ status: { code: 0 }, metadata: { music: [{ title: 'T', artists: [{ name: 'A' }, { name: 'B' }] }] } });
  assert.equal(r.artist, 'A, B');
  assert.equal(r.positionSeconds, null);
});

test('no result and errors', () => {
  assert.equal(parseACRCloud({ status: { code: 1001, msg: 'No result' } }).status, 'nomatch');
  assert.equal(parseACRCloud({ status: { code: 0 }, metadata: { music: [] } }).status, 'nomatch');
  const limit = parseACRCloud({ status: { code: 3003, msg: 'Limit exceeded' } });
  assert.deepEqual([limit.status, limit.message, limit.code], ['error', 'ACRCloud request limit reached', 3003]);
  assert.match(parseACRCloud({ status: { code: 3001, msg: 'invalid access key' } }).message, /invalid access key/);
  assert.equal(parseACRCloud(null).status, 'error');
});

test('sends the documented form fields and the real host by default', async () => {
  let sent;
  const result = await recognizeACRCloud({
    wav: new Uint8Array([1, 2, 3, 4]), host: 'identify-eu-west-1.acrcloud.com', accessKey: 'key', accessSecret: 'secret',
    clipSeconds: 12, now: () => 1579408708000,
    fetchImpl: async (url, init) => { sent = { url, form: init.body }; return { status: 200, json: async () => MATCH }; },
  });
  assert.equal(result.status, 'match');
  assert.equal(sent.url, 'https://identify-eu-west-1.acrcloud.com/v1/identify');
  assert.equal(sent.form.get('access_key'), 'key');
  assert.equal(sent.form.get('data_type'), 'audio');
  assert.equal(sent.form.get('signature_version'), '1');
  assert.equal(sent.form.get('timestamp'), '1579408708');
  assert.equal(sent.form.get('sample_bytes'), '4');
  assert.equal(sent.form.get('sample').size, 4);
  assert.equal(sent.form.get('signature'), createHmac('sha1', 'secret').update('POST\n/v1/identify\nkey\naudio\n1\n1579408708').digest('base64'));
  assert.equal(sent.form.get('secret'), null); // the secret never leaves the device
});

test('reports missing credentials and network failures', async () => {
  const none = await recognizeACRCloud({ wav: new Uint8Array(), host: '', accessKey: '', accessSecret: '' });
  assert.match(none.message, /credentials/);
  const down = await recognizeACRCloud({ wav: new Uint8Array(), host: 'h', accessKey: 'k', accessSecret: 's', fetchImpl: async () => { throw new Error('offline'); } });
  assert.match(down.message, /offline/);
});

test('providers: picks the service, checks configuration, routes through the relay', async () => {
  assert.equal(providerOf({}), 'audd');
  assert.equal(providerOf({ provider: 'bogus' }), 'audd');
  assert.equal(isConfigured({ provider: 'audd', token: 't' }), true);
  assert.equal(isConfigured({ provider: 'audd', token: '' }), false);
  assert.equal(isConfigured({ provider: 'acrcloud', acrHost: 'h', acrKey: 'k' }), false);
  assert.equal(isConfigured({ provider: 'acrcloud', acrHost: 'h', acrKey: 'k', acrSecret: 's' }), true);

  const urls = [];
  const fake = async (url) => { urls.push(url); return { status: 200, json: async () => ({ status: 'success', result: null }) }; };
  await createRecognizer({ provider: 'audd', token: 't' }, { relay: true, fetchImpl: fake })(new Uint8Array(1));
  await createRecognizer({ provider: 'audd', token: 't' }, { relay: false, fetchImpl: fake })(new Uint8Array(1));
  await createRecognizer({ provider: 'audd', token: 't', endpoint: 'http://custom/' }, { relay: true, fetchImpl: fake })(new Uint8Array(1));
  const acr = async (url) => { urls.push(url); return { status: 200, json: async () => ({ status: { code: 1001 } }) }; };
  const r = await createRecognizer({ provider: 'acrcloud', acrHost: 'identify-us-west-2.acrcloud.com', acrKey: 'k', acrSecret: 's' }, { relay: true, fetchImpl: acr })(new Uint8Array(1));
  assert.equal(r.status, 'nomatch');
  assert.deepEqual(urls, ['/api/recognize', 'https://api.audd.io/', 'http://custom/', '/api/acrcloud?host=identify-us-west-2.acrcloud.com']);
});
