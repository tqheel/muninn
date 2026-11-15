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
