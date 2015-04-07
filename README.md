# livestreamer-mp3
Checks a specific channel for stream status (ustream only for now) and starts
livestreamer, which pipes into ffmpeg and transcodes into an MP3 audio stream,
which is served through HTTP. Plays a fallback track on loop, when stream is down.

##Dependancies
- livestreamer
- ffmpeg with libmp3lame

##Setup
- `npm install`
- Copy `config.js.example` to `config.js` and configure
- Copy `fallback.mp3` into the root directory. This will be streamed, when the
source stream is down.