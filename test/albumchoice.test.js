import { test } from 'node:test';
import assert from 'node:assert/strict';
import { artistKey, trackOnRelease, rememberChoice, formatCandidate } from '../web/albumchoice.js';

test('artist keys ignore case and punctuation', () => {
  assert.equal(artistKey('Robert Johnson'), artistKey('robert  johnson!'));
});

test('checks a track against a release list', () => {
  const tracks = [{ title: 'Cross Road Blues' }, { title: 'Hellhound on My Trail' }];
  assert.equal(trackOnRelease(tracks, 'Cross Road Blues (Take 2)'), true);
  assert.equal(trackOnRelease(tracks, 'Something Else'), false);
  assert.equal(trackOnRelease([], 'x'), false);
});

test('remembers the newest choice per artist and trims old ones', () => {
  let c = rememberChoice({}, 'Robert Johnson', { id: 'a', title: 'A' });
  c = rememberChoice(c, 'Robert Johnson', { id: 'b', title: 'B' });
  assert.deepEqual(c, { 'robert johnson': { id: 'b', title: 'B' } });
  let many = {};
  for (let i = 0; i < 5; i++) many = rememberChoice(many, `Artist ${i}`, { id: String(i) }, 3);
  assert.deepEqual(Object.keys(many), ['artist 2', 'artist 3', 'artist 4']);
});

test('does not mutate the stored choices', () => {
  const original = { x: { id: '1' } };
  rememberChoice(original, 'Y', { id: '2' });
  assert.deepEqual(Object.keys(original), ['x']);
});

test('formats a candidate for the picker', () => {
  assert.deepEqual(
    formatCandidate({ title: 'The Complete Recordings', year: '1990', formats: ['CD'], discs: 2, trackCount: 41, compilation: true }),
    { title: 'The Complete Recordings', detail: '1990 · CD · 2 discs · 41 tracks · compilation' },
  );
  assert.equal(formatCandidate({ title: 'X', formats: [] }).detail, '');
});

import { stickyKey } from '../web/albumchoice.js';

test('album mode stays on the album on screen when the track is on it', () => {
  const current = { artist: 'Bruce Springsteen', album: 'Greetings', cacheKey: 'k1' };
  const tracks = [{ title: 'Blinded by the Light' }, { title: 'Mary Queen of Arkansas' }];
  const match = { artist: 'Bruce Springsteen', title: 'Mary Queen of Arkansas (Album Version)', album: 'Box set' };
  assert.equal(stickyKey({ mode: 'album', current, match, tracks }), 'k1');
  assert.equal(stickyKey({ mode: 'shuffle', current, match, tracks }), null);
  assert.equal(stickyKey({ mode: 'album', current, match: { ...match, artist: 'Someone Else' }, tracks }), null);
  assert.equal(stickyKey({ mode: 'album', current, match: { ...match, title: 'Born to Run' }, tracks }), null);
  assert.equal(stickyKey({ mode: 'album', current: null, match, tracks }), null);
});
