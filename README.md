# muninn

A display that listens to whatever is playing in the room and tells me what it is: the artist, the album, the track, and a little about the artist. Later, the same for a movie or show on the screen.

In Norse myth, Odin sends his two ravens out every day to see and hear the world, and they come back and tell him what they learned. Huginn is thought. Muninn is memory. This is the second one.

**Status: working on the Mac with real music, not yet on the Chromebook.** I have run it against real CDs and records through a real microphone with both recognition services, and it names the artist, album and track and follows the album in order. I have not yet tried a real record flip. The Chromebook, the "what am I watching" feature and long unattended runs are still untested. Accuracy on a whole collection is still unmeasured, and the recognition services sometimes name the wrong release, which is what the **Wrong album?** button is for.

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
- Once it knows the album, it pulls the track list and track lengths from MusicBrainz and uses them to predict track changes, so it does not need to ask the service constantly. In **album mode**, the default, it moves to the next track in order on its own and checks with a real clip every third track (every second on vinyl). **Shuffle mode** identifies every track instead.
- **Vinyl** is a toggle. When it is on and the sound stops for a while, muninn keeps the album on screen and waits for me to flip the record, then listens again and fetches the track list fresh.
- **Refresh** forgets the current album and listens again, for when I change discs.
- **Wrong album?** The service names the song correctly but often the wrong release, such as a compilation instead of the set I am holding. A quiet button next to the album title lists every release that contains the recording, and I pick the right one. It then follows that release's track order, and remembers the choice for that artist on this device.
- The recognition service is swappable. AudD and ACRCloud are built in, chosen in Settings, and adding another means writing one small client that returns the same result shape (see `web/providers.js`). I added this because AudD bills a flat monthly fee whether or not I listen.
- Album art from the Cover Art Archive. Artist notes from Wikipedia.
- It detects the platform it is running on and adapts: which audio input to use, how to keep the screen awake, how to lay out the display, and which developer conveniences to turn on.

I develop and test on a Mac. It is meant to run on an old Chromebook that I will leave next to the stereo as the display.

## Recognition services

muninn needs one service to turn a short clip into a song. It supports two, chosen in Settings, and each keeps its own saved credentials, so I can switch back and forth without retyping anything.

**AudD** ([audd.io](https://audd.io))
1. Create an account and copy the API token from the dashboard.
2. In muninn, open Settings, choose AudD, and paste the token. Leave the endpoint on Automatic.
3. Cost, as I understand it: a flat monthly plan (about $5 for 1,000 requests) that resets each month whether I listen or not, plus a one-time allowance of free requests at signup. Check their site for current prices.

**ACRCloud** ([acrcloud.com](https://www.acrcloud.com))
1. Sign up at console.acrcloud.com. The trial lasts 14 days, so I start it only when I am ready to test.
2. Create an audio recognition project, choose the ACRCloud Music bucket (the large commercial catalog) and the recorded audio source.
3. In muninn, open Settings, choose ACRCloud, pick the region shown on the project, and enter the access key and access secret.
4. Cost: after the trial it is pay for what I use. I have not confirmed the price per request, because it is behind their login.

I have not checked either service's retention policy for the clips they receive.

Both work through the relay in `muninn serve`, which forwards the clip and keeps nothing. ACRCloud requests are signed in the browser, so the secret never leaves the device. For a different service, write one small client that returns the same result shape and add it to `web/providers.js`.

## Privacy

The recognition service I choose receives short clips of audio. That is the whole data flow. muninn does not keep a listening history, and nothing about me or my collection lives in this repository. API tokens are entered in the app on each device and are never committed.

## Roadmap

Done:

- Project setup and platform detection.
- The display, album and artist lookups, and track-change prediction.
- Album mode, shuffle mode, vinyl flips and manual refresh.
- Choosing the right release when the service names the wrong one.
- Two recognition services, AudD and ACRCloud, tested with real music on the Mac.
- Idle and no-match states.
- Movie and show recognition (experimental, tested only with fake data).

Still to do:

- Set it up on the Chromebook and check the microphone, fullscreen and keeping the screen awake.
- Run it for days and see whether it stays reliable.
- Settle which service to keep, based on accuracy and what I actually spend.
- If the microphone is not accurate enough, tap the receiver's output directly.

## Using it on the Chromebook (no install)

The display is published as a static page at **https://tqheel.github.io/muninn/**, rebuilt from `web/` on every push to `main`. It is served over HTTPS, so the microphone works, and both recognition services accept calls straight from the browser, so no server is needed. Open it, press Settings, enter my keys once, and start. Keys stay in that browser and are not part of the published files.

## Running it on the Mac

You need Node 20 or newer and nothing else. There is nothing to install.

```
node bin/muninn.js serve --open
```

That serves the display on `http://localhost:8080` and relays recognition requests, so the browser never has to talk to the recognition service directly. Click Start, allow the microphone, and pick a recognition service in Settings (see Recognition services above). Credentials stay in that browser.

On the Mac, `?demo=1` on the address runs the whole display with canned results and no microphone, which is how I develop the layout. `?debug=1` adds a small log of what each recognition did, for working out why it picked an album.

To measure how well recognition works on your own collection, put short clips in a folder named like `Artist - Title.wav` (they are ignored by git) and run:

```
RECOGNITION_API_TOKEN=... node bin/muninn.js eval path/to/clips
```

For ACRCloud, set `RECOGNITION_PROVIDER=acrcloud`, `ACRCLOUD_HOST`, `ACRCLOUD_ACCESS_KEY` and `ACRCLOUD_ACCESS_SECRET` instead. `.env.example` shows both. It prints a hit, wrong or miss for each clip and an overall hit rate.

## Development

```
npm test
```

The tests use the Node test runner and fake network responses. Changes are recorded in [CHANGELOG.md](CHANGELOG.md). The web app is plain ES modules with no build step: `web/` holds the display and `src/` holds the small server and the evaluation script.

## License

MIT. See [LICENSE](LICENSE).
