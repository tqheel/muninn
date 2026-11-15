// Client for the AudD music recognition API, plus a parser that turns its
// response into the shape the rest of the app uses.

export const AUDD_URL = 'https://api.audd.io/';

function parseTimecode(value) {
  if (typeof value !== 'string') return null;
  const parts = value.split(':').map(Number);
  if (!parts.length || parts.some(Number.isNaN)) return null;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

export function parseAudD(json) {
  if (!json || typeof json !== 'object') return { status: 'error', message: 'Empty response' };
  if (json.status === 'error') {
    return { status: 'error', message: json.error?.error_message ?? 'Recognition service error', code: json.error?.error_code };
  }
  const r = json.result;
  if (!r) return { status: 'nomatch' };
  const artUrl =
    r.apple_music?.artwork?.url?.replace('{w}', '600').replace('{h}', '600') ??
    r.spotify?.album?.images?.[0]?.url ??
    null;
  return {
    status: 'match',
    title: r.title ?? '',
    artist: r.artist ?? '',
    album: r.album ?? '',
    releaseDate: r.release_date ?? null,
    positionSeconds: parseTimecode(r.timecode),
    artUrl,
  };
}

export async function recognize({ wav, token, endpoint = AUDD_URL, fetchImpl = fetch }) {
  if (!token) return { status: 'error', message: 'No recognition token set' };
  const form = new FormData();
  form.append('api_token', token);
  form.append('return', 'apple_music,spotify');
  form.append('audio', new Blob([wav], { type: 'audio/wav' }), 'clip.wav');
  let response;
  try {
    response = await fetchImpl(endpoint, { method: 'POST', body: form });
  } catch (err) {
    return { status: 'error', message: `Could not reach the recognition service (${err.message})` };
  }
  let json;
  try {
    json = await response.json();
  } catch {
    return { status: 'error', message: `Unreadable response (HTTP ${response.status})` };
  }
  return parseAudD(json);
}
