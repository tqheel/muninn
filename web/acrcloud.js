// Client for the ACRCloud identification API. Requests are signed with
// HMAC-SHA1 (access secret as the key), so the secret stays on this device and
// only the signature is sent. Written from ACRCloud's published docs; the
// exact error codes and the meaning of play_offset_ms still need checking
// against a real trial account.

export function normalizeHost(host = '') {
  return host.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
}

export async function signRequest({ accessKey, accessSecret, timestamp, cryptoImpl = globalThis.crypto }) {
  if (!cryptoImpl?.subtle) throw new Error('Signing needs a secure page (localhost or https)');
  const stringToSign = ['POST', '/v1/identify', accessKey, 'audio', '1', timestamp].join('\n');
  const encoder = new TextEncoder();
  const key = await cryptoImpl.subtle.importKey('raw', encoder.encode(accessSecret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const bytes = new Uint8Array(await cryptoImpl.subtle.sign('HMAC', key, encoder.encode(stringToSign)));
  return btoa(String.fromCharCode(...bytes));
}

// clipSeconds converts the end-of-sample offset into the position where the clip started.
// ASSUMPTION: play_offset_ms is where the sample ends in the matched track. Verify on the trial.
export function parseACRCloud(json, clipSeconds = 0) {
  if (!json || typeof json !== 'object' || !json.status) return { status: 'error', message: 'Empty response' };
  const { code, msg } = json.status;
  if (code === 1001) return { status: 'nomatch' };
  if (code !== 0) {
    const message = code === 3003 ? 'ACRCloud request limit reached' : `ACRCloud: ${msg ?? 'service error'}`;
    return { status: 'error', message, code };
  }
  const m = json.metadata?.music?.[0];
  if (!m) return { status: 'nomatch' };
  const end = typeof m.play_offset_ms === 'number' ? m.play_offset_ms / 1000 : null;
  return {
    status: 'match',
    title: m.title ?? '',
    artist: (m.artists ?? []).map((a) => a.name).filter(Boolean).join(', '),
    album: m.album?.name ?? '',
    releaseDate: m.release_date ?? null,
    positionSeconds: end === null ? null : Math.max(0, end - clipSeconds),
    artUrl: null, // ACRCloud gives no image; the Cover Art Archive supplies art
    score: m.score ?? null,
  };
}

export async function recognizeACRCloud({
  wav, host, accessKey, accessSecret, endpoint, clipSeconds = 0, fetchImpl = fetch, now = Date.now, cryptoImpl,
}) {
  const cleanHost = normalizeHost(host);
  if (!cleanHost || !accessKey || !accessSecret) {
    return { status: 'error', message: 'No ACRCloud credentials set (host, access key and secret)' };
  }
  const timestamp = String(Math.floor(now() / 1000));
  let signature;
  try {
    signature = await signRequest({ accessKey, accessSecret, timestamp, cryptoImpl });
  } catch (err) {
    return { status: 'error', message: err.message };
  }
  const form = new FormData();
  form.append('sample', new Blob([wav], { type: 'audio/wav' }), 'clip.wav');
  form.append('sample_bytes', String(wav.length));
  form.append('access_key', accessKey);
  form.append('data_type', 'audio');
  form.append('signature_version', '1');
  form.append('signature', signature);
  form.append('timestamp', timestamp);
  let response;
  try {
    response = await fetchImpl(endpoint ?? `https://${cleanHost}/v1/identify`, { method: 'POST', body: form });
  } catch (err) {
    return { status: 'error', message: `Could not reach ACRCloud (${err.message})` };
  }
  let json;
  try {
    json = await response.json();
  } catch {
    return { status: 'error', message: `Unreadable response (HTTP ${response.status})` };
  }
  return parseACRCloud(json, clipSeconds);
}
