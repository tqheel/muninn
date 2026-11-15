import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeWav, rms, concat } from '../web/wav.js';

test('encodes a valid 16-bit mono WAV header and samples', () => {
  const wav = encodeWav(new Float32Array([0, 1, -1, 0.5]), 44100);
  const view = new DataView(wav.buffer);
  const text = (o, n) => String.fromCharCode(...wav.slice(o, o + n));
  assert.equal(text(0, 4), 'RIFF');
  assert.equal(text(8, 4), 'WAVE');
  assert.equal(view.getUint32(24, true), 44100);
  assert.equal(view.getUint16(22, true), 1);
  assert.equal(view.getUint16(34, true), 16);
  assert.equal(view.getUint32(40, true), 8);
  assert.equal(wav.length, 44 + 8);
  assert.equal(view.getInt16(46, true), 32767);
  assert.equal(view.getInt16(48, true), -32768);
});

test('clips out-of-range samples', () => {
  const view = new DataView(encodeWav(new Float32Array([2, -2]), 8000).buffer);
  assert.equal(view.getInt16(44, true), 32767);
  assert.equal(view.getInt16(46, true), -32768);
});

test('rms and concat', () => {
  assert.equal(rms(new Float32Array(0)), 0);
  assert.ok(Math.abs(rms(new Float32Array([0.5, -0.5])) - 0.5) < 1e-9);
  assert.deepEqual(Array.from(concat([new Float32Array([1, 2]), new Float32Array([3])])), [1, 2, 3]);
});
