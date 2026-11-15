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

// In album mode, a later clip of the same disc can come back from the service with a
// different album name (a box set, say). If the track is on the album already on screen,
// stay on it. Returns that album's cache key, or null to look the album up as usual.
export function stickyKey({ mode, current, match, tracks }) {
  if (mode !== 'album' || !current?.cacheKey || !tracks?.length) return null;
  if (artistKey(current.artist) !== artistKey(match.artist)) return null;
  return trackOnRelease(tracks, match.title) ? current.cacheKey : null;
}
