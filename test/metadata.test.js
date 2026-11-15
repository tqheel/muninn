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

import { toCandidate, parseRecordingSearch, parseReleaseCandidates, lookupReleaseCandidates, searchReleases, lookupEverything } from '../web/metadata.js';

const releaseJson = (id, over = {}) => ({
  id, title: `Album ${id}`, date: '1990-09-08', status: 'Official',
  media: [{ format: 'CD', 'track-count': 15 }, { format: 'CD', 'track-count': 14 }],
  'release-group': { 'secondary-types': ['Compilation'] },
  ...over,
});

test('turns a release into a picker candidate', () => {
  assert.deepEqual(toCandidate(releaseJson('a')), {
    id: 'a', title: 'Album a', year: '1990', status: 'Official', formats: ['CD'], discs: 2, trackCount: 29, compilation: true,
  });
  const bare = toCandidate({ id: 'b', title: 'X' });
  assert.deepEqual([bare.year, bare.formats, bare.discs, bare.trackCount, bare.compilation], [null, [], null, null, false]);
});

test('collects releases across recordings without duplicates, official first', () => {
  const json = { recordings: [
    { releases: [releaseJson('a', { status: 'Bootleg' }), releaseJson('b')] },
    { releases: [releaseJson('b'), releaseJson('c', { status: 'Promotion' })] },
  ] };
  assert.deepEqual(parseRecordingSearch(json).map((c) => c.id), ['b', 'a', 'c']);
  assert.deepEqual(parseRecordingSearch({}), []);
  assert.deepEqual(parseReleaseCandidates({ releases: [releaseJson('z')] }).map((c) => c.id), ['z']);
});

test('candidate searches build the right queries', async () => {
  const urls = [];
  const fake = async (url) => { urls.push(decodeURIComponent(url)); return { ok: true, json: async () => ({ recordings: [], releases: [] }) }; };
  await lookupReleaseCandidates({ artist: 'Robert Johnson', title: 'Cross Road Blues' }, fake);
  await searchReleases({ artist: 'Robert Johnson', album: 'The Complete Recordings' }, fake);
  assert.match(urls[0], /\/recording\/\?query=recording:"Cross Road Blues" AND artist:"Robert Johnson"/);
  assert.match(urls[1], /\/release\/\?query=release:"The Complete Recordings" AND artist:"Robert Johnson"/);
});

test('a chosen release id skips the search and keeps the release title', async () => {
  const urls = [];
  const fake = async (url) => {
    urls.push(url);
    if (url.includes('musicbrainz.org/ws/2/release/rel-1')) {
      return { ok: true, status: 200, json: async () => ({ id: 'rel-1', title: 'The Complete Recordings', media: [{ position: 1, tracks: [{ position: 1, title: 'Kind Hearted Woman Blues', length: 180000 }] }] }) };
    }
    return { ok: true, json: async () => ({ type: 'standard', extract: 'Bluesman' }) };
  };
  const extras = await lookupEverything({ artist: 'Robert Johnson', album: 'Wrong Compilation' }, fake, { releaseId: 'rel-1' });
  assert.equal(extras.albumTitle, 'The Complete Recordings');
  assert.equal(extras.releaseId, 'rel-1');
  assert.equal(extras.tracks.length, 1);
  assert.equal(urls.some((u) => u.includes('/release/?query=')), false);
  assert.equal(extras.bio.extract, 'Bluesman');
});
