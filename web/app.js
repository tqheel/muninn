import { currentPlatform, detectFeatures, getProfile } from './platform.js';
import { loadSettings, saveSettings } from './settings.js';
import { rms, concat, encodeWav } from './wav.js';
import { recognize, AUDD_URL } from './recognize.js';
import { lookupEverything, normalizeTitle } from './metadata.js';
import { Tracker } from './tracker.js';
import { captureFrame, identifyFrame, lookupTitle } from './watch.js';
import { DEMO_ALBUM, demoMatch } from './demo.js';

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
let endpoint = AUDD_URL;
let busy = false;
let view = 'idle';
let watchUntil = 0;
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
  $('album').textContent = match.album;
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
      result = await recognize({ wav: encodeWav(samples, ctx.sampleRate), token: settings.token, endpoint });
    }
    if (myEpoch !== epoch) return; // the disc was changed while this clip was in flight
    const key = `${result.artist}|${result.album}`;
    const outcome = tracker.applyResult(result, Date.now(), clip, albumCache.get(key)?.tracks);
    if (outcome === 'match') {
      setStatus('');
      renderNow(result, albumCache.get(key));
      if (!albumCache.has(key) || refresh) await loadExtras(result, key);
    } else if (outcome === 'nomatch') {
      setStatus('Could not identify this yet. Will try again.');
    } else {
      setStatus(result.message);
      if (/token/i.test(result.message)) $('settings').showModal();
    }
  } catch (err) {
    setStatus(`Something went wrong: ${err.message}`);
  } finally {
    busy = false;
  }
}

async function loadExtras(match, key) {
  const extras = demo ? { ...DEMO_ALBUM, tracks: DEMO_ALBUM.tracks.map((t) => ({ ...t, lengthMs: t.lengthMs / 30 })) } : await lookupEverything(match);
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
    renderNow(current, albumCache.get(`${current.artist}|${current.album}`));
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

async function detectEndpoint() {
  if (settings.endpoint) return settings.endpoint;
  try {
    const res = await fetch('/api/health');
    if (res.ok) return '/api/recognize'; // served by `muninn serve`, which relays the request
  } catch { /* opened some other way */ }
  return AUDD_URL;
}

function refreshControls() {
  $('mode-btn').textContent = tracker.mode === 'shuffle' ? 'Shuffle mode' : 'Album mode';
  $('vinyl-btn').setAttribute('aria-pressed', String(tracker.vinyl));
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
  tracker.requestRefresh();
  setView('idle');
  $('idle-text').textContent = 'Listening for the next record or disc';
  setStatus('');
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
  endpoint = await detectEndpoint();
  $('start').hidden = true;
  $('display').hidden = false;
  if (profile.fullscreen) document.documentElement.requestFullscreen?.().catch(() => {});
  await keepAwake();
  refreshWatchButton();
  refreshControls();
  setView('idle');
  setInterval(tick, 500);
  if (!settings.token && !demo) $('settings').showModal();
}

function openSettings() {
  $('set-token').value = settings.token;
  $('set-endpoint').value = settings.endpoint;
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
    token: $('set-token').value.trim(),
    endpoint: $('set-endpoint').value.trim(),
    clipSeconds: Number($('set-clip').value) || 0,
    anthropicKey: $('set-anthropic').value.trim(),
    tmdbKey: $('set-tmdb').value.trim(),
    deviceId: $('set-device').value,
  };
  if (!saveSettings(settings)) setStatus('Could not save settings on this device.');
  endpoint = await detectEndpoint();
  refreshWatchButton();
  if (settings.deviceId !== previousDevice && ctx) setStatus('Reload to use the new microphone.');
});

$('start-btn').addEventListener('click', start);
$('start-settings-btn').addEventListener('click', openSettings);
$('settings-btn').addEventListener('click', openSettings);
$('watch-btn').addEventListener('click', watchNow);
$('refresh-btn').addEventListener('click', manualRefresh);
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
