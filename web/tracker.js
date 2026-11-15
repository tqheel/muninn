// Decides when to ask the recognition service again. Pure logic with no timers
// or DOM, so it can be tested with fake clocks.
//
// Album mode (default): records and CDs play in order, so once an album is
// known the tracker can advance to the next track without asking, and only
// verifies with a real clip every few tracks. Shuffle mode asks at every change.
// Vinyl mode expects a flip: a long silence keeps the album on screen, and when
// sound returns the tracker asks again and flags that the track list should be
// fetched fresh.

import { findTrackIndex } from './metadata.js';

export class Tracker {
  constructor({
    silenceThreshold = 0.01,
    gapMs = 1500,
    idleMs = 60000,
    vinylIdleMs = 15 * 60000,
    flipSilenceMs = 8000,
    retryMs = [15000, 30000, 60000],
    minSpacingMs = 8000,
    endMarginMs = 1500,
    nearEndMs = 10000,
    recheckMs = 90000,
    verifyEvery = 3,
    vinylVerifyEvery = 2,
    mode = 'album',
    vinyl = false,
  } = {}) {
    Object.assign(this, {
      silenceThreshold, gapMs, idleMs, vinylIdleMs, flipSilenceMs, retryMs, minSpacingMs,
      endMarginMs, nearEndMs, recheckMs, verifyEvery, vinylVerifyEvery, mode, vinyl,
    });
    this.reset();
  }

  // Clears what is playing. Mode and vinyl are settings and stay as they are.
  reset() {
    this.current = null; // { title, artist, album, assumed?, ... }
    this.startedAt = null;
    this.lengthMs = null;
    this.tracks = [];
    this.index = -1;
    this.assumedCount = 0; // tracks advanced since the last real match
    this.misses = 0;
    this.lastAttempt = -Infinity;
    this.silentSince = null;
    this.loud = false;
    this.gapSeen = false;
    this.forceNow = false; // ask as soon as there is sound
    this.refreshPending = false; // fetch the track list fresh on the next match
    this.attemptRefresh = false; // the attempt now in flight wants a fresh track list
  }

  // The user changed discs or wants to start over.
  requestRefresh() {
    this.reset();
    this.refreshPending = true;
    this.forceNow = true;
  }

  observe(level, now) {
    this.loud = level >= this.silenceThreshold;
    if (this.loud) {
      if (this.silentSince !== null) {
        const quiet = now - this.silentSince;
        if (quiet >= this.gapMs) this.gapSeen = true;
        if (this.vinyl && this.current && quiet >= this.flipSilenceMs) {
          this.forceNow = true;
          this.refreshPending = true;
        }
      }
      this.silentSince = null;
    } else if (this.silentSince === null) {
      this.silentSince = now;
    }
  }

  waitingForFlip(now) {
    return this.vinyl && Boolean(this.current) && this.silentSince !== null && now - this.silentSince >= this.flipSilenceMs;
  }

  canAdvance() {
    const every = this.vinyl ? this.vinylVerifyEvery : this.verifyEvery;
    return this.index >= 0 && this.index + 1 < this.tracks.length && Boolean(this.lengthMs) && this.assumedCount < every - 1;
  }

  // Returns 'idle' (nothing playing), 'recognize', 'advance' (next track in order, no request) or 'wait'.
  update(now) {
    const idleAfter = this.vinyl ? this.vinylIdleMs : this.idleMs;
    if (this.silentSince !== null && now - this.silentSince >= idleAfter) {
      this.reset();
      this.silentSince = now - idleAfter;
      return 'idle';
    }
    if (!this.loud) return this.current ? 'wait' : 'idle';
    if (this.forceNow) return 'recognize';

    const endAt = this.current && this.lengthMs ? this.startedAt + this.lengthMs : null;
    const ended = endAt !== null && now >= endAt + this.endMarginMs;

    if (this.mode === 'album' && this.canAdvance()) {
      if (ended || (this.gapSeen && now >= endAt - this.nearEndMs)) return 'advance';
    }

    const spacing = this.misses > 0 ? this.retryMs[Math.min(this.misses - 1, this.retryMs.length - 1)] : this.minSpacingMs;
    if (now - this.lastAttempt < spacing) return 'wait';

    if (!this.current) return 'recognize';
    if (this.gapSeen) return 'recognize'; // shuffle, or an unexpected gap in album mode
    if (ended) return 'recognize';
    if (!this.lengthMs && now - this.lastAttempt >= this.recheckMs) return 'recognize';
    return 'wait';
  }

  // Moves to the next track in the list without asking the service.
  advance(now) {
    const next = this.tracks[this.index + 1];
    this.startedAt = this.gapSeen ? now : this.startedAt + this.lengthMs;
    this.index += 1;
    this.lengthMs = next.lengthMs ?? null;
    this.assumedCount += 1;
    this.gapSeen = false;
    this.current = { ...this.current, title: next.title, positionSeconds: 0, assumed: true };
    return this.current;
  }

  beginAttempt(now) {
    this.lastAttempt = now;
    this.gapSeen = false;
    this.forceNow = false;
    this.attemptRefresh = this.refreshPending;
  }

  // capturedAt is when the clip finished recording. tracks is the album track list, if known.
  applyResult(result, capturedAt, clipSeconds, tracks = []) {
    if (result.status === 'match') {
      this.misses = 0;
      this.assumedCount = 0;
      this.refreshPending = false;
      const elapsed = (result.positionSeconds ?? 0) + clipSeconds;
      this.current = result;
      this.startedAt = capturedAt - elapsed * 1000;
      this.tracks = tracks;
      this.index = findTrackIndex(tracks, result.title);
      this.lengthMs = tracks[this.index]?.lengthMs ?? null;
      return 'match';
    }
    this.misses += 1;
    return result.status;
  }

  // Called when the track list arrives after the match.
  setTracks(tracks) {
    if (!this.current) return;
    this.tracks = tracks;
    this.index = findTrackIndex(tracks, this.current.title);
    // A track found without a length keeps what we had. A track missing from the list has no known length.
    this.lengthMs = tracks[this.index]?.lengthMs ?? (this.index >= 0 ? this.lengthMs : null);
  }

  elapsedSeconds(now) {
    return this.current && this.startedAt !== null ? Math.max(0, (now - this.startedAt) / 1000) : 0;
  }
}
