// Decides when to ask the recognition service again. Pure logic with no timers
// or DOM, so it can be tested with fake clocks. Records and CDs play in order,
// so once a track and its length are known the next lookup can wait for the
// predicted end, a gap in the sound, or a long quiet stretch.

import { findTrack } from './metadata.js';

export class Tracker {
  constructor({
    silenceThreshold = 0.01,
    gapMs = 1500,
    idleMs = 60000,
    retryMs = [15000, 30000, 60000],
    minSpacingMs = 8000,
    endMarginMs = 1500,
    recheckMs = 90000,
  } = {}) {
    Object.assign(this, { silenceThreshold, gapMs, idleMs, retryMs, minSpacingMs, endMarginMs, recheckMs });
    this.reset();
  }

  reset() {
    this.current = null; // { title, artist, album, ... }
    this.startedAt = null;
    this.lengthMs = null;
    this.misses = 0;
    this.lastAttempt = -Infinity;
    this.silentSince = null;
    this.loud = false;
    this.gapSeen = false;
  }

  observe(level, now) {
    this.loud = level >= this.silenceThreshold;
    if (this.loud) {
      if (this.silentSince !== null && now - this.silentSince >= this.gapMs) this.gapSeen = true;
      this.silentSince = null;
    } else if (this.silentSince === null) {
      this.silentSince = now;
    }
  }

  // Returns 'idle' (nothing playing), 'recognize' or 'wait'.
  update(now) {
    if (this.silentSince !== null && now - this.silentSince >= this.idleMs) {
      this.reset();
      this.silentSince = now - this.idleMs;
      return 'idle';
    }
    if (!this.loud) return this.current ? 'wait' : 'idle';

    const spacing = this.misses > 0 ? this.retryMs[Math.min(this.misses - 1, this.retryMs.length - 1)] : this.minSpacingMs;
    if (now - this.lastAttempt < spacing) return 'wait';

    if (!this.current) return 'recognize';
    if (this.gapSeen) return 'recognize';
    if (this.lengthMs && now >= this.startedAt + this.lengthMs + this.endMarginMs) return 'recognize';
    if (!this.lengthMs && now - this.lastAttempt >= this.recheckMs) return 'recognize';
    return 'wait';
  }

  beginAttempt(now) {
    this.lastAttempt = now;
    this.gapSeen = false;
  }

  // capturedAt is when the clip finished recording. tracks is the album track list, if known.
  applyResult(result, capturedAt, clipSeconds, tracks = []) {
    if (result.status === 'match') {
      this.misses = 0;
      const elapsed = (result.positionSeconds ?? 0) + clipSeconds;
      this.current = result;
      this.startedAt = capturedAt - elapsed * 1000;
      this.lengthMs = findTrack(tracks, result.title)?.lengthMs ?? null;
      return 'match';
    }
    this.misses += 1;
    return result.status;
  }

  // Called when the track list arrives after the match.
  setTracks(tracks) {
    if (this.current) this.lengthMs = findTrack(tracks, this.current.title)?.lengthMs ?? this.lengthMs;
  }

  elapsedSeconds(now) {
    return this.current && this.startedAt !== null ? Math.max(0, (now - this.startedAt) / 1000) : 0;
  }
}
