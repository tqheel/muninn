import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Tracker } from '../web/tracker.js';

const LOUD = 0.1;
const QUIET = 0;
const match = (title, positionSeconds = 0) => ({ status: 'match', title, artist: 'A', album: 'B', positionSeconds });

function playing() {
  const t = new Tracker();
  t.observe(LOUD, 0);
  assert.equal(t.update(0), 'recognize');
  t.beginAttempt(0);
  t.applyResult(match('One', 30), 10000, 10, [{ title: 'One', lengthMs: 100000 }]);
  return t;
}

test('asks once sound starts, and is idle on silence', () => {
  const t = new Tracker();
  t.observe(QUIET, 0);
  assert.equal(t.update(0), 'idle');
  t.observe(LOUD, 1000);
  assert.equal(t.update(1000), 'recognize');
});

test('start time accounts for position in the track plus the clip', () => {
  const t = playing();
  assert.equal(t.startedAt, 10000 - 40000);
  assert.equal(t.elapsedSeconds(10000), 40);
});

test('waits until the predicted end of the track', () => {
  const t = playing();
  const end = t.startedAt + 100000;
  t.observe(LOUD, 20000);
  assert.equal(t.update(20000), 'wait');
  t.observe(LOUD, end);
  assert.equal(t.update(end), 'wait'); // inside the margin
  t.observe(LOUD, end + 2000);
  assert.equal(t.update(end + 2000), 'recognize');
});

test('a gap in the sound triggers a new lookup', () => {
  const t = playing();
  t.observe(QUIET, 20000);
  assert.equal(t.update(20000), 'wait');
  t.observe(LOUD, 22000);
  assert.equal(t.update(22000), 'recognize');
});

test('a brief dip is not a gap', () => {
  const t = playing();
  t.observe(QUIET, 20000);
  t.observe(LOUD, 20500);
  assert.equal(t.update(20500), 'wait');
});

test('long silence goes idle and forgets the track', () => {
  const t = playing();
  t.observe(QUIET, 20000);
  assert.equal(t.update(20000 + 60000), 'idle');
  assert.equal(t.current, null);
});

test('misses back off before retrying', () => {
  const t = new Tracker();
  t.observe(LOUD, 0);
  t.beginAttempt(0);
  t.applyResult({ status: 'nomatch' }, 10000, 10);
  t.observe(LOUD, 10000);
  assert.equal(t.update(10000), 'wait');
  assert.equal(t.update(15000), 'recognize');
  t.beginAttempt(15000);
  t.applyResult({ status: 'nomatch' }, 25000, 10);
  assert.equal(t.update(40000), 'wait');
  assert.equal(t.update(45000), 'recognize');
});

test('unknown length rechecks on a slow timer', () => {
  const t = new Tracker();
  t.observe(LOUD, 0);
  t.beginAttempt(0);
  t.applyResult(match('Mystery'), 10000, 10, []);
  assert.equal(t.lengthMs, null);
  t.observe(LOUD, 60000);
  assert.equal(t.update(60000), 'wait');
  t.observe(LOUD, 91000);
  assert.equal(t.update(91000), 'recognize');
});

test('track list arriving later fills in the length', () => {
  const t = new Tracker();
  t.observe(LOUD, 0);
  t.beginAttempt(0);
  t.applyResult(match('One'), 10000, 10, []);
  t.setTracks([{ title: 'One (Remastered)', lengthMs: 50000 }]);
  assert.equal(t.lengthMs, 50000);
});

test('errors count as misses without losing the current track', () => {
  const t = playing();
  t.applyResult({ status: 'error', message: 'x' }, 30000, 10);
  assert.equal(t.current.title, 'One');
  assert.equal(t.misses, 1);
});

// ---- album mode, shuffle, vinyl, refresh ----

const ALBUM = [
  { title: 'One', lengthMs: 100000 },
  { title: 'Two', lengthMs: 100000 },
  { title: 'Three', lengthMs: 100000 },
  { title: 'Four', lengthMs: 100000 },
  { title: 'Five', lengthMs: 100000 },
];

function onAlbum(options = {}) {
  const t = new Tracker(options);
  t.observe(LOUD, 0);
  t.beginAttempt(0);
  t.applyResult(match('One'), 0, 0, ALBUM); // track One started at 0
  return t;
}

test('album mode advances in order without asking, then verifies every third track', () => {
  const t = onAlbum();
  t.observe(LOUD, 101600);
  assert.equal(t.update(101600), 'advance');
  assert.equal(t.advance(101600).title, 'Two');
  assert.equal(t.current.assumed, true);
  assert.equal(t.startedAt, 100000);

  t.observe(LOUD, 201600);
  assert.equal(t.update(201600), 'advance');
  assert.equal(t.advance(201600).title, 'Three');

  t.observe(LOUD, 301600);
  assert.equal(t.update(301600), 'recognize'); // two assumed in a row, so verify
  t.beginAttempt(301600);
  t.applyResult(match('Four', 0), 305000, 5, ALBUM);
  assert.equal(t.assumedCount, 0);
  assert.equal(t.index, 3);
});

test('a gap near the predicted end advances early', () => {
  const t = onAlbum();
  t.observe(QUIET, 92000);
  t.observe(LOUD, 94000); // gap of 2s, 6s before the predicted end
  assert.equal(t.update(94000), 'advance');
  t.advance(94000);
  assert.equal(t.startedAt, 94000);
});

test('a gap far from the predicted end means something unexpected, so it asks', () => {
  const t = onAlbum();
  t.observe(QUIET, 20000);
  t.observe(LOUD, 23000);
  assert.equal(t.update(23000), 'recognize');
});

test('the last track cannot advance, so it asks', () => {
  const t = new Tracker();
  t.observe(LOUD, 0);
  t.beginAttempt(0);
  t.applyResult(match('Five'), 0, 0, ALBUM);
  t.observe(LOUD, 101600);
  assert.equal(t.update(101600), 'recognize');
});

test('shuffle mode never advances on its own', () => {
  const t = onAlbum({ mode: 'shuffle' });
  t.observe(LOUD, 101600);
  assert.equal(t.update(101600), 'recognize');
});

test('mode can change while running', () => {
  const t = onAlbum();
  t.mode = 'shuffle';
  t.observe(LOUD, 101600);
  assert.equal(t.update(101600), 'recognize');
});

test('an unknown track length falls back to asking', () => {
  const t = new Tracker();
  t.observe(LOUD, 0);
  t.beginAttempt(0);
  t.applyResult(match('One'), 0, 0, [{ title: 'One', lengthMs: null }, { title: 'Two', lengthMs: 100000 }]);
  assert.equal(t.canAdvance(), false);
});

test('vinyl verifies on every second track', () => {
  const t = onAlbum({ vinyl: true });
  t.observe(LOUD, 101600);
  assert.equal(t.update(101600), 'advance');
  t.advance(101600);
  t.observe(LOUD, 201600);
  assert.equal(t.update(201600), 'recognize');
});

test('vinyl: a long silence waits for the flip, then asks and refreshes the track list', () => {
  const t = onAlbum({ vinyl: true });
  t.observe(QUIET, 50000);
  assert.equal(t.waitingForFlip(55000), false);
  assert.equal(t.update(60000), 'wait');
  assert.equal(t.waitingForFlip(60000), true);
  t.observe(QUIET, 200000);
  assert.equal(t.update(200000), 'wait'); // still shows the album long after, not idle
  t.observe(LOUD, 210000);
  assert.equal(t.update(210000), 'recognize');
  t.beginAttempt(210000);
  assert.equal(t.attemptRefresh, true);
  t.applyResult(match('Four', 10), 222000, 12, ALBUM);
  assert.equal(t.refreshPending, false);
});

test('vinyl off: the same silence just idles out as before', () => {
  const t = onAlbum();
  t.observe(QUIET, 50000);
  assert.equal(t.update(50000 + 60000), 'idle');
  assert.equal(t.current, null);
});

test('vinyl eventually idles after a very long silence', () => {
  const t = onAlbum({ vinyl: true });
  t.observe(QUIET, 50000);
  assert.equal(t.update(50000 + 15 * 60000), 'idle');
  assert.equal(t.current, null);
});

test('manual refresh clears the album and asks as soon as there is sound', () => {
  const t = onAlbum({ vinyl: true });
  t.requestRefresh();
  assert.equal(t.current, null);
  assert.equal(t.vinyl, true); // settings survive
  t.observe(QUIET, 1000);
  assert.equal(t.update(1000), 'idle'); // nothing to hear yet, no wasted request
  t.observe(LOUD, 5000);
  assert.equal(t.update(5000), 'recognize');
  t.beginAttempt(5000);
  assert.equal(t.attemptRefresh, true);
  t.applyResult({ status: 'nomatch' }, 17000, 12);
  assert.equal(t.refreshPending, true); // a failed attempt does not lose the refresh
});

test('a track missing from the chosen release has no known length', () => {
  const t = onAlbum();
  assert.equal(t.lengthMs, 100000);
  t.setTracks([{ title: 'Different', lengthMs: 5000 }]);
  assert.equal(t.index, -1);
  assert.equal(t.lengthMs, null);
  assert.equal(t.canAdvance(), false);
});
