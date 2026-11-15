# muninn

A display that listens to whatever is playing in the room and tells me what it is: the artist, the album, the track, and a little about the artist. Later, the same for a movie or show on the screen.

In Norse myth, Odin sends his two ravens out every day to see and hear the world, and they come back and tell him what they learned. Huginn is thought. Muninn is memory. This is the second one.

**Status: built, not yet proven on my own collection.** The display, the recognition loop, the album and artist lookups and the track-change logic are written and tested with fake data. I have not yet run it against real music through a real microphone, because that needs my recognition token and the Chromebook. Until I have, treat the accuracy as unknown.

## Why I am building this

I have been moving back to physical media on purpose. I want to set aside time to sit and listen to music, to put a record or a disc on and let it play, the way I did before everything became a stream. The point is the slow, deliberate experience. A screen of menus and playlists is the opposite of that.

The gear is the easy part. I have a CD player, a receiver, and a turntable that was my father's, a 1974 Dual. I also have a lot of CDs and records. What I do not have is a way to see what is playing. A CD in a standard player carries almost no information about itself, and a record carries none. Some of the players I looked at could not show a track title at all, and the services they once used to look titles up have been shut down. I wanted the kind of thing a liner note gives you: who this is, what album, which track, what else they made.

I also did not want to rip my collection or run a media server. That is the kind of maintenance that ends a hobby. I want an appliance: set it up, leave it on, and it works.

So muninn listens. It hears the music through a microphone, works out what it is, and shows it. It does not care whether the sound came from a record, a disc, or anything else.

## What it does

- Listen to the room and recognize the music playing, from any source.
- Show the artist, album, track title and album art, with the track list and the current track marked.
- Show a short note about the artist.
- Stay out of the way. This is a liner-notes display, not another screen that asks for attention.
- Keep working when it is left on for days.

I care most about CDs, but it should recognize anything, vinyl included.

## Next feature: what am I watching

The same idea for the screen: if I am watching a movie or a show, muninn tells me what it is, with the cast, the year, and a short synopsis. There is no good off-the-shelf service for identifying a movie from its sound, so this one works differently. When I press a button, it grabs a single picture (the screen itself on the Mac, or the camera on the Chromebook), asks a vision model what it is, and looks the title up on TMDB. It is experimental, it needs two more keys, and it only runs when I ask. The picture is sent once and never stored. Matching on dialogue is still an idea, not built.

## How it works

- A single web page that runs full screen. It records a short clip with the microphone, sends it to a music recognition service, and shows the result.
- Once it knows the album, it pulls the track list and track lengths from MusicBrainz and uses them to predict track changes, so it does not need to ask the service constantly.
- Album art from the Cover Art Archive. Artist notes from Wikipedia.
- It detects the platform it is running on and adapts: which audio input to use, how to keep the screen awake, how to lay out the display, and which developer conveniences to turn on.

I develop and test on a Mac. It is meant to run on an old Chromebook that I will leave next to the stereo as the display.

## Privacy

The recognition service receives short clips of audio. That is the whole data flow. muninn does not keep a listening history, and nothing about me or my collection lives in this repository. API tokens are entered in the app on each device and are never committed.

## Roadmap

Done, with tests on fake data:

0. Project setup and platform detection.
2. Album, art and artist lookups.
3. The display.
4. Predicting track changes.
6. Idle and no-match states.
7. Movie and show recognition (experimental).

Waiting on me:

1. Test recognition with the microphone against my own CDs and records. This decides whether AudD is good enough or I need another service.
5. If the microphone is not accurate enough, tap the receiver's output directly.

## Running it

You need Node 20 or newer and nothing else. There is nothing to install.

```
node bin/muninn.js serve --open
```

That serves the display on `http://localhost:8080` and relays recognition requests, so the browser never has to talk to the recognition service directly. Click Start, allow the microphone, and enter an [AudD](https://audd.io) token in Settings. The token stays in that browser.

On the Mac, `?demo=1` on the address runs the whole display with canned results and no microphone, which is how I develop the layout.

To measure how well recognition works on your own collection, put short clips in a folder named like `Artist - Title.wav` (they are ignored by git) and run:

```
RECOGNITION_API_TOKEN=... node bin/muninn.js eval path/to/clips
```

It prints a hit, wrong or miss for each clip and an overall hit rate.

## Development

```
npm test
```

The tests use the Node test runner and fake network responses. The web app is plain ES modules with no build step: `web/` holds the display and `src/` holds the small server and the evaluation script.

## License

MIT. See [LICENSE](LICENSE).
