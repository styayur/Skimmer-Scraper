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
  Choose a preferred voice for each companion under **系统声线**. Automatic
  selection assigns distinct voices when available and varies rate and pitch
  by role. A missing local voice leaves captions available. The microphone
  language pack applies to recognition. System speech goes directly through
  SpeechSynthesis and the platform audio output.
- **Local high-quality speech** runs the Mandarin Kokoro model in a dedicated
  Worker. Opt in with **本地高质量语音** to download a model from Hugging Face.
  Compatible hardware WebGPU with `shader-f16` runs the 177 MB mixed-precision
  weights. There is also a 27 MB runtime and
  about 0.5 MB per Kokoro voice. The first use needs internet access.
  Where supported, the browser downloads the weights in at most six ranges at
  once. A retry can resume completed ranges. The browser verifies the pinned
  SHA-256 before storing the complete file in its cache.
  The browser can cache the downloads for later use. **卸载模型** frees the
  inference Worker while leaving the cache available. The Worker also exits
  after 45 seconds idle. Download or inference failure can fall back to local
  system speech or captions. Non-Mandarin lines use the same fallback.
  The single-threaded WASM-only experiment was slow and produced invalid
  waveform samples. Browsers without compatible WebGPU use the system or
  caption fallback immediately.
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
Speech volume applies to all voices. Previews select the companion and use
the same audio output path as in flight. Kokoro model downloads contact
Hugging Face and its asset hosts. Local Kokoro inference keeps each line and
its generated audio inside the browser.
The npm build skips ONNX Runtime's Node postinstall, which would otherwise
fetch platform GPU packages. The browser uses the separately pinned Web runtime.
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
- [Browser Kokoro implementation and license](https://github.com/uzen-zone/kokoro-js/tree/bbc3b5da19965257db0c8e6c9fb9381175b165a7)
- [Pinned mixed-precision Mandarin weights](https://huggingface.co/hsc666/Kokoro-82M-v1.1-zh-ONNX-webgpu/tree/cf37b65bbce28544e5cecc6ab826b05548c590d8)
- [Pinned Mandarin voice embeddings](https://huggingface.co/onnx-community/Kokoro-82M-v1.1-zh-ONNX/tree/6cc0f0d2ebe369a68b0df87c2b65c1af8c0ac3e3/voices)

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
Set `SKIMMER_VOICE_EVIDENCE_DIR` to save the report and screenshots to a
separate test directory.
Normal CI uses synthetic provider responses. The paid check does not record
browser traces, request headers or raw audio.
