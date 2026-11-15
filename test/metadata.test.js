import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTitle, findTrack, parseReleaseSearch, parseRelease, parseWikipedia, lookupArtist, coverArtUrl } from '../web/metadata.js';

test('normalizes titles for matching', () => {
  assert.equal(normalizeTitle('So What (Remastered 2009)'), 'so what');
  assert.equal(normalizeTitle('Blue in Green - Take 1'), 'blue in green');
  assert.equal(normalizeTitle("Don't Stop!"), 'don t stop');
  assert.equal(normalizeTitle('Café'), 'café');
});

test('finds a track by fuzzy title', () => {
  const tracks = [{ title: 'So What' }, { title: 'All Blues' }];
  assert.equal(findTrack(tracks, 'So What (Remastered)').title, 'So What');
  assert.equal(findTrack(tracks, 'Nope'), null);
  assert.equal(findTrack(tracks, ''), null);
});

test('prefers official releases, then score', () => {
  const id = parseReleaseSearch({ releases: [
    { id: 'a', score: 100, status: 'Bootleg' },
    { id: 'b', score: 90, status: 'Official' },
    { id: 'c', score: 95, status: 'Official' },
  ] });
  assert.equal(id, 'c');
  assert.equal(parseReleaseSearch({ releases: [] }), null);
});

test('flattens tracks across discs', () => {
  const r = parseRelease({ id: 'x', title: 'T', media: [
    { position: 1, tracks: [{ position: 1, title: 'One', length: 1000 }] },
    { position: 2, tracks: [{ position: 1, title: 'Two' }] },
  ] });
  assert.deepEqual(r.tracks, [
    { disc: 1, number: 1, label: '1', title: 'One', lengthMs: 1000 },
    { disc: 2, number: 1, label: '1', title: 'Two', lengthMs: null },
  ]);
});

test('wikipedia summary must be a standard article', () => {
  assert.equal(parseWikipedia({ type: 'disambiguation', extract: 'x' }), null);
  assert.equal(parseWikipedia({ type: 'standard', extract: 'Hello', content_urls: { desktop: { page: 'u' } } }).url, 'u');
});

test('artist lookup skips disambiguation pages', async () => {
  const seen = [];
  const bio = await lookupArtist('Genesis', async (url) => {
    seen.push(url);
    const standard = url.includes('(band)');
    return { ok: true, json: async () => (standard ? { type: 'standard', extract: 'Band bio' } : { type: 'disambiguation', extract: 'x' }) };
  });
  assert.equal(bio.extract, 'Band bio');
  assert.equal(seen.length, 2);
});

test('cover art url', () => {
  assert.equal(coverArtUrl(null), null);
  assert.match(coverArtUrl('abc'), /release\/abc\/front-500$/);
});
