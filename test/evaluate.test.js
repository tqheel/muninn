import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expectedFromName, judge, evaluate } from '../src/evaluate.js';

test('reads expected artist and title from the file name', () => {
  assert.deepEqual(expectedFromName('/x/Miles Davis - So What.wav'), { artist: 'Miles Davis', title: 'So What' });
  assert.equal(expectedFromName('clip1.wav'), null);
});

test('judges results', () => {
  const exp = { artist: 'Miles Davis', title: 'So What' };
  assert.equal(judge(exp, { status: 'match', artist: 'Miles Davis', title: 'So What (Remastered)' }), 'hit');
  assert.equal(judge(exp, { status: 'match', artist: 'Other', title: 'So What' }), 'wrong');
  assert.equal(judge(exp, { status: 'nomatch' }), 'miss');
  assert.equal(judge(exp, { status: 'error' }), 'error');
  assert.equal(judge(null, { status: 'match', artist: 'x', title: 'y' }), 'match');
});

test('evaluates a folder and reports the hit rate', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'muninn-'));
  await writeFile(path.join(dir, 'A - One.wav'), 'x');
  await writeFile(path.join(dir, 'B - Two.wav'), 'x');
  await writeFile(path.join(dir, 'notes.txt'), 'x');
  const answers = { 'A - One.wav': { status: 'match', artist: 'A', title: 'One' }, 'B - Two.wav': { status: 'nomatch' } };
  let i = 0;
  const summary = await evaluate({
    dir, token: 't', log: () => {},
    recognizeImpl: async () => answers[['A - One.wav', 'B - Two.wav'][i++]],
  });
  assert.equal(summary.clips, 2);
  assert.equal(summary.hit, 1);
  assert.equal(summary.miss, 1);
  assert.equal(summary.hitRate, 0.5);
});
