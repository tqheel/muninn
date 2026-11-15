// Album, art and artist lookups: MusicBrainz, Cover Art Archive, Wikipedia.

const MB = 'https://musicbrainz.org/ws/2';
const MIN_GAP_MS = 1100; // MusicBrainz asks for at most one request per second

let lastCall = 0;
async function throttle() {
  const wait = lastCall + MIN_GAP_MS - Date.now();
  lastCall = Math.max(Date.now(), lastCall + MIN_GAP_MS);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

export function normalizeTitle(title = '') {
  return title
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/\s-\s.*$/, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function findTrackIndex(tracks, title) {
  const wanted = normalizeTitle(title);
  if (!wanted) return -1;
  return tracks.findIndex((t) => normalizeTitle(t.title) === wanted);
}

export function findTrack(tracks, title) {
  return tracks[findTrackIndex(tracks, title)] ?? null;
}

export function parseReleaseSearch(json) {
  const releases = json?.releases ?? [];
  if (!releases.length) return null;
  const ranked = [...releases].sort((a, b) => {
    const official = (r) => (r.status === 'Official' ? 1 : 0);
    return official(b) - official(a) || (b.score ?? 0) - (a.score ?? 0);
  });
  return ranked[0].id;
}

export function parseRelease(json) {
  const tracks = [];
  for (const medium of json?.media ?? []) {
    for (const t of medium.tracks ?? []) {
      tracks.push({
        disc: medium.position ?? 1,
        number: t.position,
        label: t.number ?? String(t.position), // vinyl releases use A1, B2 and so on
        title: t.title,
        lengthMs: t.length ?? null,
      });
    }
  }
  return {
    mbid: json?.id ?? null,
    title: json?.title ?? '',
    tracks,
  };
}

export function parseWikipedia(json) {
  if (!json || json.type !== 'standard' || !json.extract) return null;
  return { extract: json.extract, url: json.content_urls?.desktop?.page ?? null };
}

// MusicBrainz answers 503 when busy; one patient retry is enough.
async function getJson(url, fetchImpl, retryMs = 2500) {
  let res = await fetchImpl(url, { headers: { Accept: 'application/json' } });
  if (res.status === 503 && retryMs) {
    await new Promise((r) => setTimeout(r, retryMs));
    res = await fetchImpl(url, { headers: { Accept: 'application/json' } });
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const quote = (s) => `"${s.replace(/(["\\])/g, '\\$1')}"`;

export async function lookupAlbum({ artist, album }, fetchImpl = fetch) {
  if (!album) return null;
  await throttle();
  const query = `release:${quote(album)} AND artist:${quote(artist)}`;
  const search = await getJson(`${MB}/release/?query=${encodeURIComponent(query)}&fmt=json&limit=10`, fetchImpl);
  const id = parseReleaseSearch(search);
  if (!id) return null;
  await throttle();
  return parseRelease(await getJson(`${MB}/release/${id}?inc=recordings&fmt=json`, fetchImpl));
}

export function coverArtUrl(mbid) {
  return mbid ? `https://coverartarchive.org/release/${mbid}/front-500` : null;
}

export async function lookupArtist(artist, fetchImpl = fetch) {
  if (!artist) return null;
  const candidates = [artist, `${artist} (band)`, `${artist} (musician)`, `${artist} (singer)`];
  for (const name of candidates) {
    try {
      const json = await getJson(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name.replace(/ /g, '_'))}`,
        fetchImpl,
      );
      const parsed = parseWikipedia(json);
      if (parsed) return parsed;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

export async function lookupEverything(match, fetchImpl = fetch) {
  const [album, artist] = await Promise.all([
    lookupAlbum(match, fetchImpl).catch(() => null),
    lookupArtist(match.artist, fetchImpl),
  ]);
  return {
    tracks: album?.tracks ?? [],
    artUrl: coverArtUrl(album?.mbid) ?? match.artUrl ?? null,
    bio: artist,
  };
}
