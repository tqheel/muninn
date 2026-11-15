// Detects where muninn is running and picks defaults. Behavior still depends on
// feature detection first; the platform only chooses sensible starting values.

export function detectPlatform({ uaData, userAgent = '' } = {}) {
  const hint = uaData?.platform ?? '';
  if (/chrome\s?os/i.test(hint) || /\bCrOS\b/.test(userAgent)) return 'chromeos';
  if (/mac/i.test(hint) || /Macintosh|Mac OS X/.test(userAgent)) return 'macos';
  if (/linux/i.test(hint) || /Linux|X11/.test(userAgent)) return 'linux';
  return 'other';
}

export function detectFeatures(env = globalThis) {
  const nav = env.navigator ?? {};
  const doc = env.document;
  return {
    microphone: Boolean(nav.mediaDevices?.getUserMedia),
    wakeLock: Boolean(nav.wakeLock?.request),
    fullscreen: Boolean(doc?.documentElement?.requestFullscreen),
    screenCapture: Boolean(nav.mediaDevices?.getDisplayMedia),
    audioWorklet: typeof env.AudioWorkletNode !== 'undefined',
  };
}

const BASE = {
  clipSeconds: 10,
  silenceThreshold: 0.01,
  fullscreen: false,
  keepAwake: false,
  devTools: false,
  videoSource: 'camera',
};

// Plain config, one place. Built-in microphones differ, so capture settings do too.
const PROFILES = {
  macos: { ...BASE, clipSeconds: 10, silenceThreshold: 0.008, devTools: true, videoSource: 'screen' },
  chromeos: { ...BASE, clipSeconds: 12, silenceThreshold: 0.012, fullscreen: true, keepAwake: true },
  linux: { ...BASE, clipSeconds: 12, silenceThreshold: 0.01, fullscreen: true, keepAwake: true },
  other: { ...BASE },
};

export function getProfile(platform, features = {}) {
  const profile = { ...(PROFILES[platform] ?? PROFILES.other) };
  if (!features.fullscreen) profile.fullscreen = false;
  if (!features.wakeLock) profile.keepAwake = false;
  if (profile.videoSource === 'screen' && !features.screenCapture) profile.videoSource = 'camera';
  return profile;
}

export function currentPlatform(env = globalThis) {
  const nav = env.navigator ?? {};
  return detectPlatform({ uaData: nav.userAgentData, userAgent: nav.userAgent });
}
