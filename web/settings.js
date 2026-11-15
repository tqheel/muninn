// Per-device settings in local storage. Storage can be missing or blocked, so
// every access is guarded and the app still works with defaults.

const KEY = 'muninn.settings';

export const DEFAULTS = {
  token: '',
  endpoint: '',
  deviceId: '',
  clipSeconds: 0, // 0 means use the platform profile
  anthropicKey: '',
  tmdbKey: '',
  mode: 'album', // 'album' follows the album in order, 'shuffle' identifies every track
  vinyl: false,
};

export function loadSettings(storage = globalThis.localStorage) {
  try {
    return { ...DEFAULTS, ...JSON.parse(storage.getItem(KEY) ?? '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings, storage = globalThis.localStorage) {
  try {
    storage.setItem(KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}
