// Remembering which release the listener picked, kept per artist on this device.
// It is a small preference list, not a listening history.

import { normalizeTitle, findTrackIndex } from './metadata.js';

export const artistKey = (artist) => normalizeTitle(artist);

export const trackOnRelease = (tracks, title) => findTrackIndex(tracks, title) >= 0;

// Newest choice last; the oldest fall off past the cap.
export function rememberChoice(choices, artist, choice, cap = 50) {
  const next = { ...choices };
  const key = artistKey(artist);
  delete next[key];
  next[key] = choice;
  const keys = Object.keys(next);
  while (keys.length > cap) delete next[keys.shift()];
  return next;
}

export function formatCandidate(c) {
  const parts = [];
  if (c.year) parts.push(c.year);
  if (c.formats?.length) parts.push(c.formats.join(' + '));
  if (c.discs > 1) parts.push(`${c.discs} discs`);
  if (c.trackCount) parts.push(`${c.trackCount} tracks`);
  if (c.compilation) parts.push('compilation');
  return { title: c.title, detail: parts.join(' \u00b7 ') };
}
