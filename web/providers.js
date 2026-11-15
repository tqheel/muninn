// The recognition service is swappable. A recognizer is any function that takes
// a WAV clip and resolves to the shape the app understands:
//   { status: 'match', title, artist, album, releaseDate, positionSeconds, artUrl }
//   { status: 'nomatch' }  or  { status: 'error', message }
// To add a service: write a client that returns that shape, then add it here.

import { recognize, AUDD_URL } from './recognize.js';
import { recognizeACRCloud, normalizeHost } from './acrcloud.js';

export const PROVIDERS = {
  audd: { label: 'AudD' },
  acrcloud: { label: 'ACRCloud' },
};

export function providerOf(settings) {
  return settings.provider in PROVIDERS ? settings.provider : 'audd';
}

export function isConfigured(settings) {
  return providerOf(settings) === 'acrcloud'
    ? Boolean(normalizeHost(settings.acrHost) && settings.acrKey && settings.acrSecret)
    : Boolean(settings.token);
}

// relay: true when served by `muninn serve`, which forwards requests so the browser
// does not depend on the service allowing cross-origin calls.
export function createRecognizer(settings, { relay = false, clipSeconds = 10, fetchImpl = fetch } = {}) {
  if (providerOf(settings) === 'acrcloud') {
    const host = normalizeHost(settings.acrHost);
    const endpoint = relay ? `/api/acrcloud?host=${encodeURIComponent(host)}` : undefined;
    return (wav) => recognizeACRCloud({
      wav, host, accessKey: settings.acrKey, accessSecret: settings.acrSecret, endpoint, clipSeconds, fetchImpl,
    });
  }
  const endpoint = settings.endpoint || (relay ? '/api/recognize' : AUDD_URL);
  return (wav) => recognize({ wav, token: settings.token, endpoint, fetchImpl });
}
