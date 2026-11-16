# Changelog

All notable changes to muninn are listed here, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). There are no tagged releases yet, so
everything is under Unreleased, grouped by the commit that introduced it.

## [Unreleased]

### Documentation and agent rules
- Rewrote the README status and roadmap now that it has run with real music, and added a Recognition services section that explains how to set up AudD and ACRCloud.
- Added this changelog, built from the git history.
- Added `CLAUDE.md` (and a pointer in `AGENTS.md`) telling agents to run the tests and update the changelog before every commit.

### 808fb78 - Debug trace
- Added `?debug=1` on the address, which shows a small log of each recognition: what the service heard, which album the app chose and why, and how many tracks it found. It never includes keys or audio.

### d3dd2d3 - Stay on the album on screen
- Fixed the display flipping from the right album to a box set a few seconds later. In album mode, a later clip of the same artist now keeps the album already on screen when the track is on its list, even if the service names a different release.

### e22c536 - Relay upload fix for ACRCloud
- Fixed ACRCloud answering "Invalid http content type". The relay now buffers the clip and sends it upstream with a `Content-Length` instead of a chunked stream, and the ACRCloud clip is sent as `application/octet-stream`.
- Changed the relay test to expect a buffered body.

### 9bf37b1 - Endpoint drop-downs in Settings
- Added drop-downs for the AudD endpoint (automatic or direct) and the ACRCloud region (US West, Europe, Asia Pacific), each with a Custom option.
- Each service keeps its own saved fields, so switching services does not clear the other one's credentials.

### ad9b679 - Swappable recognition service and ACRCloud
- Added `web/providers.js`, a swappable interface: a recognizer is any function from a WAV clip to a match, a no-match or an error.
- Added an ACRCloud client (`web/acrcloud.js`) that signs each request on the device with HMAC-SHA1, so the access secret is never sent.
- Added `/api/acrcloud` to the relay, limited to `identify-*.acrcloud.com` and `.cn` hosts.
- Added a Recognition service choice to Settings, and made `muninn eval` work with either service through environment variables.

### deb8a76 - Wrong album picker
- Added a **Wrong album?** button that lists every release containing the recognized recording and lets the listener pick one. The choice is remembered per artist on the device, and a **Forget my album choices** button clears it.
- Added MusicBrainz recording and release candidate lookups.

### 20b20e8 - Mode badge
- Added a badge on the display that shows the current mode (album, shuffle, vinyl).

### 95f2216 - Album mode, shuffle, vinyl, refresh
- Album mode is now the default. It advances through the track list in order and checks with a real clip every third track (every second on vinyl).
- Added shuffle mode, which identifies every track.
- Added a vinyl toggle that keeps the album on screen through a long silence, listens again when sound returns and refreshes the track list.
- Added a manual refresh button for changing discs.

### e0dee8b - AudD request fix
- Fixed AudD rejecting the request as having no file. The clip is now sent in the `file` field.

### 504d488 - Initial build
- Built the display, the recognition loop with AudD, MusicBrainz album and track lookups, Cover Art Archive art and Wikipedia artist notes.
- Built the track-change tracker, idle and no-match states, platform detection and per-platform profiles, wake lock and fullscreen, and WAV capture through an AudioWorklet.
- Built the `muninn serve` relay and the `muninn eval` hit-rate check.
- Added the experimental "what am I watching" feature (a picture, a vision model and TMDB).
- Added a demo mode (`?demo=1`) with canned results.

### 0080b97 - License
- Added the MIT license.

### fe10502 - Initial scaffold
- Added the README, `.gitignore` and a package stub.
