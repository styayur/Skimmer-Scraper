# Voice radio

Choose **Flight settings → Advanced → Voice radio** during a run. Voice
input and wingmate speech can be enabled separately. Both start off on each
page load. With input enabled, hold **V** or the in-flight talk button, speak,
then release to send. **Esc** cancels the clip. **Advanced → Controls** allows
an unused gamepad button to be assigned to push-to-talk. Supply `-1` to clear
the assignment.

The browser asks for microphone permission the first time you press to talk.
Grant it, then press again when the recording indicator is visible. Recording
ends after 12 seconds or when you release. The microphone is also released when
you cancel, pause, switch worlds, hide the game or leave the page. Press **T** to
use text whenever microphone input is unavailable. Voice output can be turned
off while keeping subtitles. Starting a transmission or clearing the radio
stops playback. A risk alert can interrupt routine speech.

## Provider choices and budgets

- **Device input** uses the browser's on-device speech recognition with an
  installed Chinese or English language pack. Use **Prepare device language**
  to check or download one. Device transcripts go to the local wingmate
  controller. Browsers without on-device recognition still support text.
- **Device output** uses matching on-device system voices and is available as
  an optional fallback for DeepSeek speech. Local voices depend on the browser
  and OS. Subtitles are always available.
- **DeepSeek input** sends the released recording directly to the DeepSeek
  ASR endpoint. The transcript goes through the same dialogue and validated
  flight orders as typed requests. **DeepSeek output** sends wingmate lines to
  the provider and plays the returned audio as it arrives. Two provider voices
  are available. Callsigns and stereo position distinguish the wingmates.

Connect your own DeepSeek key under **Model cooperation** before using either
DeepSeek option. The provider can charge for speech recognition, model tokens
and synthesis. Each page has an ASR limit of 10 clips and 60 billable seconds,
plus a TTS limit of 18 requests and 1,200 estimated billable characters. Chat
requests keep their separate request and token limits. Reconnecting on the
same page retains the budgets. If a budget is reached, local flight and text
stay available.

## Data and playback

The browser keeps audio in memory for the active clip or transmission. It does
not store microphone audio, provider keys or radio history in localStorage or
IndexedDB. Keys travel in HTTPS authorization headers to the selected provider.
The game has no credentials or recording server. Same-page scripts remain a
browser trust boundary. Disconnect to remove the key and abort voice requests.

The microphone's AudioWorklet produces 16 kHz mono samples for a 16-bit PCM
WAV upload. DeepSeek ASR takes the entire WAV. TTS uses the official HTTPS
stream of 24 kHz mono PCM. Small Web Audio buffers schedule playback ahead of
the speaker while the 120 Hz simulation continues. The player and its
companions keep their own collision and route safeguards during all requests.

- [DeepSeek speech recognition](https://api-docs.deepseek.com/guides/asr/)
- [DeepSeek speech synthesis](https://api-docs.deepseek.com/guides/tts/)
- [On-device speech recognition in Chromium](https://developer.chrome.com/release-notes/139)

## Paid browser acceptance

Serve a production build on port 4178. Set `SKIMMER_REAL_VOICE=1` and provide
`DEEPSEEK_API_KEY` in the environment. For a spoken test fixture, set
`SKIMMER_VOICE_WAV` to a local WAV containing the scout-left command. To exercise
an actual input device and Chrome's permission prompt, set `SKIMMER_REAL_MIC=1`
and manually say the command while holding **V**. Run `node scripts/voice-evidence.mjs`.
Normal CI uses synthetic provider responses. The paid check does not record
browser traces, request headers or raw audio.
