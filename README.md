# muninn

A display that listens to whatever is playing in the room and tells me what it is: the artist, the album, the track, and a little about the artist. Later, the same for a movie or show on the screen.

In Norse myth, Odin sends his two ravens out every day to see and hear the world, and they come back and tell him what they learned. Huginn is thought. Muninn is memory. This is the second one.

**Status: early planning. Nothing works yet.** This README describes what I am building and why. The code comes next.

## Why I am building this

I have been moving back to physical media on purpose. I want to set aside time to sit and listen to music, to put a record or a disc on and let it play, the way I did before everything became a stream. The point is the slow, deliberate experience. A screen of menus and playlists is the opposite of that.

The gear is the easy part. I have a CD player, a receiver, and a turntable that was my father's, a 1974 Dual. I also have a lot of CDs and records. What I do not have is a way to see what is playing. A CD in a standard player carries almost no information about itself, and a record carries none. Some of the players I looked at could not show a track title at all, and the services they once used to look titles up have been shut down. I wanted the kind of thing a liner note gives you: who this is, what album, which track, what else they made.

I also did not want to rip my collection or run a media server. That is the kind of maintenance that ends a hobby. I want an appliance: set it up, leave it on, and it works.

So muninn listens. It hears the music through a microphone, works out what it is, and shows it. It does not care whether the sound came from a record, a disc, or anything else.

## What it will do

- Listen to the room and recognize the music playing, from any source.
- Show the artist, album, track title and album art, with the track list and the current track marked.
- Show a short note about the artist.
- Stay out of the way. This is a liner-notes display, not another screen that asks for attention.
- Keep working when it is left on for days.

I care most about CDs, but it should recognize anything, vinyl included.

## Next feature: what am I watching

After music works, I want the same idea for the screen: if I am watching a movie or a show, muninn tells me what it is, with the cast, the year, and a short synopsis. This is harder, because there is no good off-the-shelf service for identifying a movie from its sound, so it is a research project of its own. The likely approaches are matching the dialogue, identifying a frame from the screen with a vision model, or a mix, depending on what the device can see and hear.

## How it will work

- A single web page that runs full screen. It records a short clip with the microphone, sends it to a music recognition service, and shows the result.
- Once it knows the album, it pulls the track list and track lengths from MusicBrainz and uses them to predict track changes, so it does not need to ask the service constantly.
- Album art from the Cover Art Archive. Artist notes from Wikipedia.
- It detects the platform it is running on and adapts: which audio input to use, how to keep the screen awake, how to lay out the display, and which developer conveniences to turn on.

I develop and test on a Mac. It is meant to run on an old Chromebook that I will leave next to the stereo as the display.

## Privacy

The recognition service receives short clips of audio. That is the whole data flow. muninn does not keep a listening history, and nothing about me or my collection lives in this repository. API tokens are entered in the app on each device and are never committed.

## Roadmap

0. Set up the project and the platform detection.
1. Test recognition with the microphone against my own CDs and records. This decides which service I use.
2. Look up the album, art and artist notes.
3. Build the display.
4. Predict track changes.
5. If the microphone is not accurate enough, tap the receiver's output directly.
6. Polish: idle state, no-match state.
7. Movie and show recognition.

## Development

Not set up yet.

## License

Not chosen yet.
