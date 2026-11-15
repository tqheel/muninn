import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectPlatform, getProfile, detectFeatures } from '../web/platform.js';

const UA = {
  macChrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  cros: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  linux: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36',
};

test('detects platforms from user agent strings', () => {
  assert.equal(detectPlatform({ userAgent: UA.macChrome }), 'macos');
  assert.equal(detectPlatform({ userAgent: UA.macSafari }), 'macos');
  assert.equal(detectPlatform({ userAgent: UA.cros }), 'chromeos');
  assert.equal(detectPlatform({ userAgent: UA.linux }), 'linux');
  assert.equal(detectPlatform({ userAgent: UA.windows }), 'other');
  assert.equal(detectPlatform({}), 'other');
});

test('user agent data wins over the string, and ChromeOS is not mistaken for Linux', () => {
  assert.equal(detectPlatform({ uaData: { platform: 'Chrome OS' }, userAgent: UA.linux }), 'chromeos');
  assert.equal(detectPlatform({ uaData: { platform: 'macOS' }, userAgent: '' }), 'macos');
  assert.equal(detectPlatform({ uaData: { platform: 'Linux' }, userAgent: '' }), 'linux');
});

test('profiles differ per platform and respect missing features', () => {
  const all = { fullscreen: true, wakeLock: true, screenCapture: true };
  const mac = getProfile('macos', all);
  const cros = getProfile('chromeos', all);
  assert.equal(mac.devTools, true);
  assert.equal(mac.fullscreen, false);
  assert.equal(mac.videoSource, 'screen');
  assert.equal(cros.devTools, false);
  assert.equal(cros.fullscreen, true);
  assert.equal(cros.keepAwake, true);
  assert.equal(cros.videoSource, 'camera');

  const bare = getProfile('chromeos', {});
  assert.equal(bare.fullscreen, false);
  assert.equal(bare.keepAwake, false);
  assert.equal(getProfile('macos', {}).videoSource, 'camera');
  assert.equal(getProfile('nonsense', all).devTools, false);
});

test('detects features from an environment object', () => {
  const env = {
    navigator: { mediaDevices: { getUserMedia() {}, getDisplayMedia() {} }, wakeLock: { request() {} } },
    document: { documentElement: { requestFullscreen() {} } },
    AudioWorkletNode: class {},
  };
  assert.deepEqual(detectFeatures(env), { microphone: true, wakeLock: true, fullscreen: true, screenCapture: true, audioWorklet: true });
  assert.equal(detectFeatures({}).microphone, false);
});
