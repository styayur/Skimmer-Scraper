# Voice radio

Choose **Flight settings → Advanced → Voice radio**. Wingmates use system
speech after a player interaction. Microphone input starts off on each page
load. With input enabled, hold **V** or the in-flight talk button, speak,
then release to send. **Esc** cancels the clip. **Advanced → Controls** allows
an unused gamepad button to be assigned to push-to-talk. Supply `-1` to clear
the assignment. Choose Chinese or English for on-device recognition,
wingmate replies and ambient radio reports.

The browser asks for microphone permission the first time you press to talk.
Grant it, then press again when the recording indicator is visible. Recording
ends after 12 seconds or when you release. The microphone is also released when
you cancel, pause, switch worlds, hide the game or leave the page. Press **T** to
use text whenever microphone input is unavailable. Voice output can be turned
off while keeping subtitles. Starting a transmission or clearing the radio
stops playback. A risk alert can interrupt routine speech. Pausing, restarting
or changing worlds clears pending calls. Captions follow the active spoken
line through the end of playback.

## Provider choices and budgets

- **Device input** uses the browser's on-device speech recognition with an
  installed Chinese or English language pack. Use **Prepare device language**
  to check or download one. Device transcripts go to the local wingmate
  controller. Browsers without on-device recognition still support text.
- **System speech** uses local voices from the browser and operating system.
  Choose a preferred voice for each companion under **伴机声线**. Automatic
  selection assigns distinct voices when available and varies rate and pitch
  by role. A missing local voice leaves captions available. The microphone
  language pack applies to recognition. System speech goes directly through
  SpeechSynthesis and the platform audio output.
- **DeepSeek input** sends the released recording directly to the DeepSeek
  ASR endpoint. The transcript goes through the same dialogue and validated
  flight orders as typed requests. **DeepSeek output** sends wingmate lines to
  the provider and plays the returned audio as it arrives. Two provider voices
  are available. Callsigns, playback rate and stereo position distinguish the
  wingmates. System speech can handle unstarted DeepSeek calls when fallback
  is enabled.

Connect your own DeepSeek key under **Model cooperation** before using either
DeepSeek option. The provider can charge for speech recognition, model tokens
and synthesis. Each page has an ASR limit of 10 clips and 60 billable seconds,
plus a TTS limit of 18 requests and 1,200 estimated billable characters. Chat
requests keep their separate request and token limits. Reconnecting on the
same page retains the budgets. If a budget is reached, local flight and text
stay available.

## Data and playback

The browser keeps audio in memory for the active clip or transmission.
Local preferences store output mode, language and preferred system voices.
Keys travel in HTTPS authorization headers to the selected provider.
The game has no credentials or recording server. Same-page scripts remain a
browser trust boundary. Disconnect to remove the key and abort voice requests.

The microphone's AudioWorklet produces 16 kHz mono samples for a 16-bit PCM
WAV upload. DeepSeek ASR takes the entire WAV. TTS uses the official HTTPS
stream of 24 kHz mono PCM. Small Web Audio buffers apply a light bandpass,
compression and panning. They schedule audio ahead of the speaker while the
120 Hz simulation continues. One voice plays at a time, with three waiting
slots and an expiry for each call. The player and its
companions keep their own collision and route safeguards during all requests.

- [DeepSeek speech recognition](https://api-docs.deepseek.com/guides/asr/)
- [DeepSeek speech synthesis](https://api-docs.deepseek.com/guides/tts/)
- [On-device speech recognition in Chromium](https://developer.chrome.com/release-notes/139)

## Design reference

Siny uses a bounded audio queue, backpressure between synthesis and the
player, cancellation, half-duplex capture and idle resource release. The
browser implementation uses those design ideas with TypeScript, platform
voices and Web Audio. Reference code and native binaries stay in Siny.
[Queue and playback design](https://github.com/styayur/siny/blob/a31619ba641e64b9d9ff572257e4ca52f66e91f6/crates/tinytts/docs/architecture.md) · [Siny source and licenses](https://github.com/styayur/siny/tree/a31619ba641e64b9d9ff572257e4ca52f66e91f6)

## Paid browser acceptance

Serve a production build on port 4178. Set `SKIMMER_REAL_VOICE=1` and provide
`DEEPSEEK_API_KEY` in the environment. For a spoken test fixture, set
`SKIMMER_VOICE_WAV` to a local WAV containing the scout-left command. To exercise
an actual input device and Chrome's permission prompt, set `SKIMMER_REAL_MIC=1`
and manually say the command while holding **V**. Run `node scripts/voice-evidence.mjs`.
Normal CI uses synthetic provider responses. The paid check does not record
browser traces, request headers or raw audio.
