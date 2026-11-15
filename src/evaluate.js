// Phase 1 hit-rate check: send each short clip in a folder to the recognition
// service and compare the answer with the expected artist and title taken from
// the file name ("Artist - Title.wav"). Clips are your own and stay out of git.

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { normalizeTitle } from '../web/metadata.js';

const AUDIO = new Set(['.wav', '.mp3', '.m4a', '.flac', '.ogg']);

export function expectedFromName(file) {
  const base = path.basename(file, path.extname(file));
  const [artist, ...rest] = base.split(' - ');
  return rest.length ? { artist: artist.trim(), title: rest.join(' - ').trim() } : null;
}

export function judge(expected, result) {
  if (result.status === 'error') return 'error';
  if (result.status === 'nomatch') return 'miss';
  if (!expected) return 'match';
  const sameTitle = normalizeTitle(result.title) === normalizeTitle(expected.title);
  const sameArtist = normalizeTitle(result.artist).includes(normalizeTitle(expected.artist)) ||
    normalizeTitle(expected.artist).includes(normalizeTitle(result.artist));
  return sameTitle && sameArtist ? 'hit' : 'wrong';
}

// recognizer is any function from a WAV/audio file's bytes to a result (see web/providers.js).
export async function evaluate({ dir, recognizer, log = console.log }) {
  const files = (await readdir(dir)).filter((f) => AUDIO.has(path.extname(f).toLowerCase())).sort();
  const tally = { hit: 0, wrong: 0, miss: 0, error: 0, match: 0 };
  let totalMs = 0;
  for (const file of files) {
    const wav = await readFile(path.join(dir, file));
    const started = Date.now();
    const result = await recognizer(wav);
    const ms = Date.now() - started;
    totalMs += ms;
    const verdict = judge(expectedFromName(file), result);
    tally[verdict] += 1;
    const got = result.status === 'match' ? `${result.artist} - ${result.title}` : result.message ?? '-';
    log(`${verdict.padEnd(6)} ${String(ms).padStart(5)}ms  ${file}  ->  ${got}`);
  }
  const scored = tally.hit + tally.wrong + tally.miss;
  const summary = {
    clips: files.length,
    ...tally,
    hitRate: scored ? tally.hit / scored : null,
    averageMs: files.length ? Math.round(totalMs / files.length) : 0,
  };
  log(`\n${summary.clips} clips: ${tally.hit} hit, ${tally.wrong} wrong, ${tally.miss} no match, ${tally.error} error` +
    (summary.hitRate === null ? '' : `, hit rate ${(summary.hitRate * 100).toFixed(0)}%`) + `, average ${summary.averageMs}ms`);
  return summary;
}
