# Voice radio

Choose **Flight settings → Advanced → Voice radio**. A fresh profile starts
with captions. Enable the character radio for event calls and short
risk calls. Routine wingmate chatter stays in the radio transcript. Flight
warning cues are part of the separate game audio and HUD. Microphone input starts off on each page
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
- **Character radio** plays bundled English Opus clips, selected by event and speaker. Chinese and English captions remain available. Free-form text remains in the transcript.
- **DeepSeek input** sends the released recording directly to the DeepSeek
  ASR endpoint. The transcript goes through the same dialogue and validated
  flight orders as typed requests. **DeepSeek output** sends wingmate lines to
  the provider and plays the returned audio as it arrives. Two provider voices
  are available. Callsigns, playback rate and stereo position distinguish the
  wingmates. Unstarted cloud speech may use the same local event clip. Other replies remain captioned.

Connect your own DeepSeek key under **Model cooperation** before using either
DeepSeek option. The provider can charge for speech recognition, model tokens
and synthesis. Each page has an ASR limit of 10 clips and 60 billable seconds,
plus a TTS limit of 18 requests and 1,200 estimated billable characters. Chat
requests keep their separate request and token limits. Reconnecting on the
same page retains the budgets. If a budget is reached, local flight and text
stay available.

## Data and playback

The browser keeps audio in memory for the active clip or transmission.
Previews and event clips share the Web Audio output, volume, stereo pan and speech queue lifecycle. The authoring input is in `art/radio/lines.json`. Run `python3 art/radio/render.py` with Flite 2.2 (SLT) and opus-tools to reproduce the clips. Local ASR, microphone input and optional cloud speech remain separate.

## Design reference

Siny uses a bounded audio queue, backpressure between synthesis and the
player, cancellation, half-duplex capture and idle resource release. The
browser implementation uses those design ideas with TypeScript, local event clips and Web Audio. Reference code and native binaries stay in Siny.
[Queue and playback design](https://github.com/styayur/siny/blob/a31619ba641e64b9d9ff572257e4ca52f66e91f6/crates/tinytts/docs/architecture.md) · [Siny source and licenses](https://github.com/styayur/siny/tree/a31619ba641e64b9d9ff572257e4ca52f66e91f6)

## Paid browser acceptance

Serve a production build on port 4178. Set `SKIMMER_REAL_VOICE=1` and provide
`DEEPSEEK_API_KEY` in the environment. For a spoken test fixture, set
`SKIMMER_VOICE_WAV` to a local WAV containing the scout-left command. To exercise
an actual input device and Chrome's permission prompt, set `SKIMMER_REAL_MIC=1`
and manually say the command while holding **V**. Run `node scripts/voice-evidence.mjs`.
Set `SKIMMER_VOICE_EVIDENCE_DIR` to save the report and screenshots to a
separate test directory.
Normal CI uses synthetic provider responses. The paid check does not record
browser traces, request headers or raw audio.
