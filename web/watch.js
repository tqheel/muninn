// "What am I watching": grab one frame on request, ask a vision model what the
// title is, then look the title up on TMDB. Nothing is stored; the frame goes to
// the model once and is dropped.

export const VISION_MODEL = 'claude-sonnet-5-5';

const PROMPT =
  'This is a frame from a movie or TV show. Identify it. Reply with JSON only, no other text: ' +
  '{"title": string|null, "year": number|null, "kind": "movie"|"tv"|null, "confidence": "high"|"medium"|"low"}. ' +
  'Use null for title if you cannot tell.';

export function parseVisionReply(text) {
  const match = /\{[\s\S]*\}/.exec(text ?? '');
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    if (!parsed.title) return null;
    return {
      title: String(parsed.title),
      year: Number.isFinite(parsed.year) ? parsed.year : null,
      kind: parsed.kind === 'tv' ? 'tv' : parsed.kind === 'movie' ? 'movie' : null,
      confidence: parsed.confidence ?? 'low',
    };
  } catch {
    return null;
  }
}

export async function identifyFrame({ jpegBase64, apiKey, fetchImpl = fetch }) {
  if (!apiKey) return { status: 'error', message: 'No Anthropic API key set' };
  let res;
  try {
    res = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: VISION_MODEL,
        max_tokens: 200,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: jpegBase64 } },
              { type: 'text', text: PROMPT },
            ],
          },
        ],
      }),
    });
  } catch (err) {
    return { status: 'error', message: `Could not reach the vision service (${err.message})` };
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) return { status: 'error', message: json?.error?.message ?? `HTTP ${res.status}` };
  const guess = parseVisionReply(json?.content?.find((b) => b.type === 'text')?.text);
  return guess ? { status: 'match', ...guess } : { status: 'nomatch' };
}

export function parseTmdbSearch(json, guess) {
  const results = (json?.results ?? []).filter((r) => r.media_type === 'movie' || r.media_type === 'tv');
  if (!results.length) return null;
  const year = (r) => Number((r.release_date ?? r.first_air_date ?? '').slice(0, 4)) || null;
  const scored = results.map((r) => {
    let score = 0;
    if (guess.kind && r.media_type === guess.kind) score += 2;
    if (guess.year && year(r) === guess.year) score += 3;
    return { r, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return { id: scored[0].r.id, type: scored[0].r.media_type };
}

export function parseTmdbDetails(json, type) {
  if (!json) return null;
  return {
    title: json.title ?? json.name,
    year: (json.release_date ?? json.first_air_date ?? '').slice(0, 4) || null,
    synopsis: json.overview ?? '',
    cast: (json.credits?.cast ?? []).slice(0, 6).map((c) => c.name),
    posterUrl: json.poster_path ? `https://image.tmdb.org/t/p/w342${json.poster_path}` : null,
    kind: type,
  };
}

export async function lookupTitle(guess, tmdbKey, fetchImpl = fetch) {
  if (!tmdbKey) return null;
  const get = async (url) => {
    const res = await fetchImpl(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  };
  const key = encodeURIComponent(tmdbKey);
  const search = await get(
    `https://api.themoviedb.org/3/search/multi?api_key=${key}&query=${encodeURIComponent(guess.title)}`,
  );
  const hit = parseTmdbSearch(search, guess);
  if (!hit) return null;
  const details = await get(`https://api.themoviedb.org/3/${hit.type}/${hit.id}?api_key=${key}&append_to_response=credits`);
  return parseTmdbDetails(details, hit.type);
}

// Browser only: capture one frame from the screen (Mac) or camera, scaled down.
export async function captureFrame(source, env = globalThis) {
  const md = env.navigator.mediaDevices;
  const stream = source === 'screen' ? await md.getDisplayMedia({ video: true }) : await md.getUserMedia({ video: true });
  try {
    const video = env.document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    await video.play();
    await new Promise((r) => setTimeout(r, 400));
    const scale = Math.min(1, 1024 / video.videoWidth);
    const canvas = env.document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
  } finally {
    stream.getTracks().forEach((t) => t.stop());
  }
}
