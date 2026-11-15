// Offline fixtures for developing the display on the Mac without playing music.
// Metadata only, no audio.

export const DEMO_ALBUM = {
  artist: 'Miles Davis',
  album: 'Kind of Blue',
  artUrl: null,
  tracks: [
    { number: 1, title: 'So What', lengthMs: 562000 },
    { number: 2, title: 'Freddie Freeloader', lengthMs: 589000 },
    { number: 3, title: 'Blue in Green', lengthMs: 337000 },
    { number: 4, title: 'All Blues', lengthMs: 696000 },
    { number: 5, title: 'Flamenco Sketches', lengthMs: 566000 },
  ],
  bio: {
    extract:
      'Miles Dewey Davis III was an American trumpeter, bandleader, and composer. He is among the most influential and acclaimed figures in the history of jazz and 20th-century music.',
    url: 'https://en.wikipedia.org/wiki/Miles_Davis',
  },
};

export function demoMatch(index) {
  const t = DEMO_ALBUM.tracks[index % DEMO_ALBUM.tracks.length];
  return {
    status: 'match',
    title: t.title,
    artist: DEMO_ALBUM.artist,
    album: DEMO_ALBUM.album,
    releaseDate: '1959-08-17',
    positionSeconds: 0,
    artUrl: DEMO_ALBUM.artUrl,
  };
}
