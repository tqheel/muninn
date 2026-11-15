import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAudD, recognize } from '../web/recognize.js';

test('parses a match with timecode and artwork', () => {
  const r = parseAudD({
    status: 'success',
    result: {
      artist: 'Miles Davis', title: 'So What', album: 'Kind of Blue', release_date: '1959-08-17', timecode: '01:23',
      apple_music: { artwork: { url: 'https://img/{w}x{h}.jpg' } },
    },
  });
  assert.equal(r.status, 'match');
  assert.equal(r.title, 'So What');
  assert.equal(r.positionSeconds, 83);
  assert.equal(r.artUrl, 'https://img/600x600.jpg');
});

test('falls back to spotify art and handles hour timecodes', () => {
  const r = parseAudD({ status: 'success', result: { artist: 'A', title: 'T', timecode: '1:02:03', spotify: { album: { images: [{ url: 'https://s/1' }] } } } });
  assert.equal(r.artUrl, 'https://s/1');
  assert.equal(r.positionSeconds, 3723);
});

test('no result is a nomatch, errors carry the message', () => {
  assert.equal(parseAudD({ status: 'success', result: null }).status, 'nomatch');
  const e = parseAudD({ status: 'error', error: { error_code: 901, error_message: 'No api_token passed' } });
  assert.deepEqual([e.status, e.message, e.code], ['error', 'No api_token passed', 901]);
  assert.equal(parseAudD(null).status, 'error');
});

test('recognize sends the token and audio, and reports failures', async () => {
  let sent;
  const ok = await recognize({
    wav: new Uint8Array([1, 2, 3]), token: 'tok', endpoint: 'http://x/',
    fetchImpl: async (url, init) => { sent = { url, init }; return { status: 200, json: async () => ({ status: 'success', result: { artist: 'A', title: 'T' } }) }; },
  });
  assert.equal(ok.status, 'match');
  assert.equal(sent.url, 'http://x/');
  assert.equal(sent.init.body.get('api_token'), 'tok');
  assert.equal(sent.init.body.get('audio').size, 3);

  assert.equal((await recognize({ wav: new Uint8Array(), token: '' })).status, 'error');
  const down = await recognize({ wav: new Uint8Array(), token: 't', fetchImpl: async () => { throw new Error('offline'); } });
  assert.match(down.message, /offline/);
  const bad = await recognize({ wav: new Uint8Array(), token: 't', fetchImpl: async () => ({ status: 502, json: async () => { throw new Error('x'); } }) });
  assert.match(bad.message, /502/);
});
