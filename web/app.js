import { currentPlatform, detectFeatures, getProfile } from './platform.js';
import { loadSettings, saveSettings } from './settings.js';
import { rms, concat, encodeWav } from './wav.js';
import { createRecognizer, isConfigured } from './providers.js';
import { ACR_HOSTS, AUDD_ENDPOINTS, CUSTOM, selectionFor, valueFor } from './endpoints.js';
import { lookupEverything, lookupReleaseCandidates, searchReleases, normalizeTitle } from './metadata.js';
import { artistKey, trackOnRelease, rememberChoice, formatCandidate, stickyKey } from './albumchoice.js';
import { Tracker } from './tracker.js';
import { captureFrame, identifyFrame, lookupTitle } from './watch.js';
import { DEMO_ALBUM, DEMO_CANDIDATES, demoMatch, demoRelease } from './demo.js';

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const platform = currentPlatform();
const features = detectFeatures();
const profile = getProfile(platform, features);
let settings = loadSettings();
const demo = new URLSearchParams(location.search).has('demo') && profile.devTools;
const clipSeconds = () => settings.clipSeconds || profile.clipSeconds;

const tracker = new Tracker({ silenceThreshold: profile.silenceThreshold, mode: settings.mode, vinyl: settings.vinyl });
const albumCache = new Map();
let relay = false; // true when served by `muninn serve`
let busy = false;
let view = 'idle';
let watchUntil = 0;
let locked = null; // the release the listener picked: { id, title, key }
let epoch = 0; // bumped on manual refresh so an in-flight answer for the old disc is dropped

// ---------- display ----------

function setView(next) {
  view = next;
  $('now').hidden = next !== 'now';
  $('idle').hidden = next !== 'idle';
  $('watching').hidden = next !== 'watch';
  if (next !== 'now') document.title = 'muninn';
}

function setStatus(text) {
  $('status').textContent = text ?? '';
}

function renderNow(match, extras) {
  setView('now');
  document.title = `${match.title} - ${match.artist}`;
  $('track').textContent = match.title;
  $('album').textContent = extras?.albumTitle ?? match.album;
  $('artist').textContent = match.artist;
  const art = $('art');
  const url = extras?.artUrl ?? match.artUrl;
  art.hidden = !url;
  art.onerror = () => { art.hidden = true; };
  if (url) art.src = url;
  const list = $('tracklist');
  list.replaceChildren();
  const current = normalizeTitle(match.title);
  for (const t of extras?.tracks ?? []) {
    const li = document.createElement('li');
    li.textContent = `${t.label ?? t.number}. ${t.title}`;
    if (normalizeTitle(t.title) === current) li.className = 'current';
    list.append(li);
  }
  $('bio').textContent = extras?.bio?.extract ?? '';
}

function renderProgress(now) {
  const bar = $('bar');
  if (!tracker.current || !tracker.lengthMs) { bar.style.width = '0'; return; }
  bar.style.width = `${Math.min(100, (tracker.elapsedSeconds(now) * 1000 / tracker.lengthMs) * 100)}%`;
}

function renderWatch(guess, details) {
  setView('watch');
  const poster = $('poster');
  poster.hidden = !details?.posterUrl;
  if (details?.posterUrl) poster.src = details.posterUrl;
  $('watch-title').textContent = details?.title ?? guess.title;
  const kind = (details?.kind ?? guess.kind) === 'tv' ? 'TV' : 'Movie';
  $('watch-meta').textContent = [kind, details?.year ?? guess.year].filter(Boolean).join(' · ');
  $('watch-cast').textContent = details?.cast?.length ? details.cast.join(', ') : '';
  $('watch-synopsis').textContent = details?.synopsis ?? `Best guess from the picture (${guess.confidence} confidence).`;
}

// ---------- audio capture ----------

let ctx = null;
const recent = [];
let recentLen = 0;
let collecting = null;

function onChunk(chunk) {
  recent.push(chunk);
  recentLen += chunk.length;
  while (recent.length > 1 && recentLen - recent[0].length >= ctx.sampleRate * 0.5) recentLen -= recent.shift().length;
  if (collecting) collecting.push(chunk);
}

const currentLevel = () => rms(concat(recent));

function collect(seconds) {
  return new Promise((resolve) => {
    collecting = [];
    setTimeout(() => {
      const chunks = collecting;
      collecting = null;
      resolve(concat(chunks));
    }, seconds * 1000);
  });
}

async function startAudio() {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: settings.deviceId ? { exact: settings.deviceId } : undefined,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  });
  ctx = new AudioContext();
  await ctx.audioWorklet.addModule('capture-worklet.js');
  const source = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, 'capture');
  node.port.onmessage = (e) => onChunk(e.data);
  const mute = ctx.createGain(); // keeps the graph running without playing the mic back
  mute.gain.value = 0;
  source.connect(node).connect(mute).connect(ctx.destination);
  await fillDevices();
}

async function fillDevices() {
  const select = $('set-device');
  const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
  select.replaceChildren(new Option('Default', ''));
  for (const d of devices) select.append(new Option(d.label || 'Microphone', d.deviceId));
  select.value = settings.deviceId;
}

// ---------- recognition loop ----------

async function attempt() {
  busy = true;
  const myEpoch = epoch;
  try {
    tracker.beginAttempt(Date.now());
    const refresh = tracker.attemptRefresh;
    setStatus('Listening…');
    let result;
    let clip = clipSeconds();
    if (demo) {
      await sleep(800);
      result = demoMatch(tracker.current ? tracker.index + 1 : 0);
      clip = 0;
    } else {
      const samples = await collect(clip);
      setStatus('Identifying…');
      result = await createRecognizer(settings, { relay, clipSeconds: clip })(encodeWav(samples, ctx.sampleRate));
    }
    if (myEpoch !== epoch) return; // the disc was changed while this clip was in flight
    let key = `${result.artist}|${result.album}`;
    if (result.status === 'match') {
      const lockKey = await applyChoice(result);
      const stay = lockKey ? null : stickyKey({ mode: tracker.mode, current: tracker.current, match: result, tracks: albumCache.get(tracker.current?.cacheKey)?.tracks });
      if (lockKey) {
        key = lockKey;
        result = { ...result, album: locked.title };
      } else if (stay) {
        key = stay;
        result = { ...result, album: tracker.current.album };
      }
      result.cacheKey = key;
    }
    const outcome = tracker.applyResult(result, Date.now(), clip, albumCache.get(key)?.tracks);
    if (outcome === 'match') {
      setStatus('');
      renderNow(result, albumCache.get(key));
      if (!albumCache.has(key) || refresh) await loadExtras(result, key);
    } else if (outcome === 'nomatch') {
      setStatus('Could not identify this yet. Will try again.');
    } else {
      setStatus(result.message);
      if (/token|credentials/i.test(result.message)) $('settings').showModal();
    }
  } catch (err) {
    setStatus(`Something went wrong: ${err.message}`);
  } finally {
    busy = false;
  }
}

// Keeps the listener's chosen release while the tracks still belong to it. Returns its cache key, or null.
async function applyChoice(match) {
  if (locked && !trackOnRelease(albumCache.get(locked.key)?.tracks ?? [], match.title)) locked = null; // a different disc
  if (!locked && !demo) {
    const remembered = settings.albumChoices?.[artistKey(match.artist)];
    if (remembered) {
      const extras = await lookupEverything(match, fetch, { releaseId: remembered.id }).catch(() => null);
      if (extras && trackOnRelease(extras.tracks, match.title)) {
        locked = { id: remembered.id, title: extras.albumTitle || remembered.title, key: `locked:${remembered.id}` };
        albumCache.set(locked.key, extras);
      }
    }
  }
  return locked?.key ?? null;
}

function demoExtras(releaseId) {
  if (!releaseId) return { ...DEMO_ALBUM, tracks: demoRelease().tracks };
  const release = demoRelease(releaseId);
  return { ...DEMO_ALBUM, tracks: release.tracks, releaseId, albumTitle: release.title };
}

async function loadExtras(match, key) {
  const releaseId = key.startsWith('locked:') ? key.slice('locked:'.length) : null;
  const extras = demo ? demoExtras(releaseId) : await lookupEverything(match, fetch, { releaseId });
  const old = albumCache.get(key);
  if (old && !extras.tracks.length) extras.tracks = old.tracks; // keep what we had if the refresh found nothing
  albumCache.set(key, extras);
  tracker.setTracks(extras.tracks);
  if (tracker.current === match) renderNow(match, extras);
}

async function tick() {
  const now = Date.now();
  tracker.observe(demo ? 0.1 : currentLevel(), now);
  const action = tracker.update(now);
  if (action === 'idle') {
    if (view !== 'idle' && !(view === 'watch' && now < watchUntil)) setView('idle');
    $('idle-text').textContent = tracker.forceNow ? 'Listening for the next record or disc' : 'Waiting for music';
    if (!busy) setStatus('');
  } else if (action === 'advance') {
    const current = tracker.advance(now);
    renderNow(current, albumCache.get(current.cacheKey));
    setStatus('Next track assumed from the album order');
  } else if (action === 'recognize' && !busy) {
    await attempt();
  } else if (tracker.waitingForFlip(now) && !busy) {
    setStatus('Waiting for the record to be flipped');
  }
  renderProgress(now);
}

// ---------- what am I watching ----------

async function watchNow() {
  if (view === 'watch') { watchUntil = 0; setView(tracker.current ? 'now' : 'idle'); return; }
  try {
    setStatus('Looking at the screen…');
    const jpegBase64 = await captureFrame(profile.videoSource);
    setStatus('Identifying…');
    const guess = await identifyFrame({ jpegBase64, apiKey: settings.anthropicKey });
    if (guess.status !== 'match') {
      setStatus(guess.message ?? 'Could not tell what is on screen.');
      return;
    }
    const details = await lookupTitle(guess, settings.tmdbKey).catch(() => null);
    watchUntil = Date.now() + 5 * 60 * 1000;
    renderWatch(guess, details);
    setStatus('');
  } catch (err) {
    setStatus(`Could not capture the picture: ${err.message}`);
  }
}

// ---------- start, settings, platform ----------

let wakeLock = null;
async function keepAwake() {
  if (!profile.keepAwake) return;
  try { wakeLock = await navigator.wakeLock.request('screen'); } catch { /* not allowed right now */ }
}

async function detectRelay() {
  try {
    return (await fetch('/api/health')).ok; // served by `muninn serve`, which relays requests
  } catch {
    return false; // opened some other way
  }
}

function refreshControls() {
  $('mode-btn').textContent = tracker.mode === 'shuffle' ? 'Shuffle mode' : 'Album mode';
  $('vinyl-btn').setAttribute('aria-pressed', String(tracker.vinyl));
  $('mode-badge').textContent = `${tracker.mode === 'shuffle' ? 'Shuffle' : 'Album'}${tracker.vinyl ? ' \u00b7 Vinyl' : ''}`;
}

function toggleMode() {
  tracker.mode = tracker.mode === 'album' ? 'shuffle' : 'album';
  settings = { ...settings, mode: tracker.mode };
  saveSettings(settings);
  refreshControls();
}

function toggleVinyl() {
  tracker.vinyl = !tracker.vinyl;
  settings = { ...settings, vinyl: tracker.vinyl };
  saveSettings(settings);
  refreshControls();
}

function manualRefresh() {
  epoch += 1;
  locked = null;
  tracker.requestRefresh();
  setView('idle');
  $('idle-text').textContent = 'Listening for the next record or disc';
  setStatus('');
}

// ---------- wrong album picker ----------

let pickerFor = null;

function showCandidates(list, emptyText) {
  $('picker-note').textContent = list.length ? 'Pick the one you are listening to.' : emptyText;
  const ul = $('picker-list');
  ul.replaceChildren();
  for (const c of list) {
    const { title, detail } = formatCandidate(c);
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    const name = document.createElement('span');
    name.textContent = title;
    const info = document.createElement('span');
    info.className = 'detail';
    info.textContent = detail;
    button.append(name, info);
    button.addEventListener('click', () => chooseRelease(c));
    li.append(button);
    ul.append(li);
  }
}

async function openPicker() {
  const match = tracker.current;
  if (!match) return;
  pickerFor = match;
  $('picker-query').value = '';
  $('picker-list').replaceChildren();
  $('picker-note').textContent = 'Looking for releases\u2026';
  $('picker').showModal();
  try {
    const list = demo ? DEMO_CANDIDATES : await lookupReleaseCandidates({ artist: match.artist, title: match.title });
    showCandidates(list, 'No releases found for this recording. Try searching by album name.');
  } catch (err) {
    $('picker-note').textContent = `Could not reach MusicBrainz (${err.message}).`;
  }
}

async function chooseRelease(candidate) {
  $('picker').close();
  const match = tracker.current;
  if (!match) return;
  setStatus('Loading that release\u2026');
  try {
    const extras = demo ? demoExtras(candidate.id) : await lookupEverything(match, fetch, { releaseId: candidate.id });
    if (!extras.tracks.length) { setStatus('Could not load the track list for that release.'); return; }
    extras.albumTitle ||= candidate.title;
    const key = `locked:${candidate.id}`;
    locked = { id: candidate.id, title: extras.albumTitle, key };
    albumCache.set(key, extras);
    settings = { ...settings, albumChoices: rememberChoice(settings.albumChoices, match.artist, { id: candidate.id, title: extras.albumTitle }) };
    saveSettings(settings);
    Object.assign(match, { album: extras.albumTitle, artUrl: extras.artUrl ?? match.artUrl, cacheKey: key });
    tracker.setTracks(extras.tracks);
    renderNow(match, extras);
    setStatus(tracker.index < 0 ? 'That release does not list this track, so album mode will check with clips.' : '');
  } catch (err) {
    setStatus(`Could not load that release: ${err.message}`);
  }
}

function forgetChoice(artist) {
  const choices = { ...settings.albumChoices };
  if (artist) delete choices[artistKey(artist)];
  settings = { ...settings, albumChoices: artist ? choices : {} };
  saveSettings(settings);
  locked = null;
}

function refreshWatchButton() {
  $('watch-btn').hidden = !settings.anthropicKey;
}

async function start() {
  $('start-note').textContent = '';
  try {
    if (!demo) {
      if (!features.microphone || !features.audioWorklet) throw new Error('This browser cannot record audio here. Use localhost or https.');
      await startAudio();
    }
  } catch (err) {
    $('start-note').textContent = `Microphone problem: ${err.message}`;
    return;
  }
  relay = await detectRelay();
  $('start').hidden = true;
  $('display').hidden = false;
  if (profile.fullscreen) document.documentElement.requestFullscreen?.().catch(() => {});
  await keepAwake();
  refreshWatchButton();
  refreshControls();
  setView('idle');
  setInterval(tick, 500);
  if (!isConfigured(settings) && !demo) $('settings').showModal();
}

function showProviderFields() {
  const acr = $('set-provider').value === 'acrcloud';
  $('audd-fields').hidden = acr;
  $('acr-fields').hidden = !acr;
}

function fillChoices(selectId, presets) {
  const select = $(selectId);
  if (select.options.length) return;
  for (const p of presets) select.add(new Option(p.label, p.value));
  select.add(new Option('Custom…', CUSTOM));
}

// Shows the text box only when "Custom" is chosen.
function syncCustom(selectId, labelId) {
  $(labelId).hidden = $(selectId).value !== CUSTOM;
}

function loadChoice(selectId, inputId, labelId, presets, saved) {
  fillChoices(selectId, presets);
  const { choice, custom } = selectionFor(presets, saved);
  $(selectId).value = choice;
  $(inputId).value = custom;
  syncCustom(selectId, labelId);
}

function openSettings() {
  $('set-provider').value = settings.provider;
  $('set-token').value = settings.token;
  loadChoice('set-endpoint-choice', 'set-endpoint', 'endpoint-custom-label', AUDD_ENDPOINTS, settings.endpoint);
  loadChoice('set-acr-host-choice', 'set-acr-host', 'acr-host-custom-label', ACR_HOSTS, settings.acrHost || ACR_HOSTS[0].value);
  $('set-acr-key').value = settings.acrKey;
  $('set-acr-secret').value = settings.acrSecret;
  showProviderFields();
  $('set-clip').value = settings.clipSeconds || '';
  $('set-anthropic').value = settings.anthropicKey;
  $('set-tmdb').value = settings.tmdbKey;
  $('set-device').value = settings.deviceId;
  $('settings').showModal();
}

$('settings').addEventListener('close', async () => {
  if ($('settings').returnValue !== 'save') return;
  const previousDevice = settings.deviceId;
  settings = {
    ...settings,
    provider: $('set-provider').value,
    token: $('set-token').value.trim(),
    endpoint: valueFor($('set-endpoint-choice').value, $('set-endpoint').value),
    acrHost: valueFor($('set-acr-host-choice').value, $('set-acr-host').value),
    acrKey: $('set-acr-key').value.trim(),
    acrSecret: $('set-acr-secret').value.trim(),
    clipSeconds: Number($('set-clip').value) || 0,
    anthropicKey: $('set-anthropic').value.trim(),
    tmdbKey: $('set-tmdb').value.trim(),
    deviceId: $('set-device').value,
  };
  if (!saveSettings(settings)) setStatus('Could not save settings on this device.');
  relay = await detectRelay();
  refreshWatchButton();
  if (settings.deviceId !== previousDevice && ctx) setStatus('Reload to use the new microphone.');
});

$('set-provider').addEventListener('change', showProviderFields);
$('set-endpoint-choice').addEventListener('change', () => syncCustom('set-endpoint-choice', 'endpoint-custom-label'));
$('set-acr-host-choice').addEventListener('change', () => syncCustom('set-acr-host-choice', 'acr-host-custom-label'));
$('start-btn').addEventListener('click', start);
$('start-settings-btn').addEventListener('click', openSettings);
$('settings-btn').addEventListener('click', openSettings);
$('watch-btn').addEventListener('click', watchNow);
$('refresh-btn').addEventListener('click', manualRefresh);
$('wrong-album-btn').addEventListener('click', openPicker);
$('picker-cancel').addEventListener('click', () => $('picker').close());
$('picker-auto').addEventListener('click', () => {
  $('picker').close();
  forgetChoice(pickerFor?.artist);
  manualRefresh();
});
$('picker-search').addEventListener('submit', async (event) => {
  event.preventDefault();
  const query = $('picker-query').value.trim();
  if (!query || !pickerFor) return;
  $('picker-note').textContent = 'Searching\u2026';
  try {
    const list = demo
      ? DEMO_CANDIDATES.filter((c) => c.title.toLowerCase().includes(query.toLowerCase()))
      : await searchReleases({ artist: pickerFor.artist, album: query });
    showCandidates(list, 'Nothing found for that name.');
  } catch (err) {
    $('picker-note').textContent = `Could not reach MusicBrainz (${err.message}).`;
  }
});
$('forget-choices').addEventListener('click', () => {
  forgetChoice();
  $('forget-choices').textContent = 'Forgotten';
});
$('vinyl-btn').addEventListener('click', toggleVinyl);
$('mode-btn').addEventListener('click', toggleMode);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && (!wakeLock || wakeLock.released)) keepAwake(); });

let cursorTimer;
document.addEventListener('mousemove', () => {
  document.body.classList.remove('idle-cursor');
  clearTimeout(cursorTimer);
  cursorTimer = setTimeout(() => document.body.classList.add('idle-cursor'), 3000);
});

$('start-note').textContent = demo
  ? 'Demo mode: canned results, no microphone.'
  : features.microphone ? `Detected: ${platform}.` : 'Microphone access needs localhost or https.';
