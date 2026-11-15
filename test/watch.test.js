import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVisionReply, parseTmdbSearch, parseTmdbDetails, identifyFrame, lookupTitle } from '../web/watch.js';

test('parses the model reply, tolerating surrounding text', () => {
  const r = parseVisionReply('Sure:\n{"title":"Alien","year":1979,"kind":"movie","confidence":"high"}');
  assert.deepEqual(r, { title: 'Alien', year: 1979, kind: 'movie', confidence: 'high' });
  assert.equal(parseVisionReply('{"title":null}'), null);
  assert.equal(parseVisionReply('no idea'), null);
  assert.equal(parseVisionReply('{bad json}'), null);
});

test('picks the TMDB result that matches kind and year', () => {
  const json = { results: [
    { id: 1, media_type: 'person' },
    { id: 2, media_type: 'movie', release_date: '2010-01-01' },
    { id: 3, media_type: 'tv', first_air_date: '1979-05-05' },
    { id: 4, media_type: 'movie', release_date: '1979-05-25' },
  ] };
  assert.deepEqual(parseTmdbSearch(json, { kind: 'movie', year: 1979 }), { id: 4, type: 'movie' });
  assert.equal(parseTmdbSearch({ results: [] }, {}), null);
});

test('summarizes TMDB details', () => {
  const d = parseTmdbDetails({ title: 'Alien', release_date: '1979-05-25', overview: 'In space...', poster_path: '/p.jpg', credits: { cast: [{ name: 'Sigourney Weaver' }, { name: 'Tom Skerritt' }] } }, 'movie');
  assert.equal(d.year, '1979');
  assert.deepEqual(d.cast, ['Sigourney Weaver', 'Tom Skerritt']);
  assert.match(d.posterUrl, /w342\/p\.jpg$/);
});

test('identifyFrame sends the image and key, and handles failures', async () => {
  let req;
  const ok = await identifyFrame({
    jpegBase64: 'AAAA', apiKey: 'k',
    fetchImpl: async (url, init) => { req = { url, init }; return { ok: true, json: async () => ({ content: [{ type: 'text', text: '{"title":"Alien","year":1979,"kind":"movie","confidence":"medium"}' }] }) }; },
  });
  assert.equal(ok.status, 'match');
  assert.equal(req.init.headers['x-api-key'], 'k');
  assert.equal(JSON.parse(req.init.body).messages[0].content[0].source.data, 'AAAA');

  assert.equal((await identifyFrame({ jpegBase64: 'x', apiKey: '' })).status, 'error');
  const nope = await identifyFrame({ jpegBase64: 'x', apiKey: 'k', fetchImpl: async () => ({ ok: true, json: async () => ({ content: [{ type: 'text', text: '{"title":null}' }] }) }) });
  assert.equal(nope.status, 'nomatch');
  const err = await identifyFrame({ jpegBase64: 'x', apiKey: 'k', fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ error: { message: 'bad key' } }) }) });
  assert.equal(err.message, 'bad key');
});

test('lookupTitle needs a key and chains search and details', async () => {
  assert.equal(await lookupTitle({ title: 'x' }, ''), null);
  const urls = [];
  const d = await lookupTitle({ title: 'Alien', kind: 'movie', year: 1979 }, 'tm', async (url) => {
    urls.push(url);
    return { ok: true, json: async () => (url.includes('search') ? { results: [{ id: 9, media_type: 'movie', release_date: '1979-05-25' }] } : { title: 'Alien', release_date: '1979-05-25', overview: 'o' }) };
  });
  assert.equal(d.title, 'Alien');
  assert.equal(urls.length, 2);
  assert.match(urls[1], /\/movie\/9\?/);
});
