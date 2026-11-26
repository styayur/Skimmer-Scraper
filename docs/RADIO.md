# Companion radio

Press **T** in flight to open the radio. Type a message and press **Enter** or
pick a suggested command. Submitting resumes flight. Reopen the panel to see
the latest 32 messages, mute subtitles or stop the current transmission.

| Callsign | Role |
| --- | --- |
| KITE-1 Navigator | Routes, terrain and taking point |
| KITE-2 Guardian | Hazards, regrouping and Surface Relay |
| KITE-3 Explorer | Unusual structures, inversion and new worlds |

Each companion can answer in Chinese or English. Without a configured model,
the team understands common commands such as `Follow me`, `一号领航`,
`二号去侦察左侧`, `全体集合`, `保持队形`, `帮我找安全路线` and
`准备 Surface Relay`. Commands still require a safe candidate route or a
nearby, eligible Relay partner. The team acknowledges an order and reports
execution after sampling the companions' actual flight. Brief risk messages
can interrupt routine chatter. Subtitles and history last for the current run.

To use a language model, open **Flight settings → Advanced → Model settings**
and connect with your own API key. The browser sends the message, team profiles,
numeric scene perception, current Trust and bounded outcome summaries to the
selected provider. The provider may charge per request. Manual radio messages and
automatic team planning share the same per-page request and token budgets.
The key lives in page memory and is cleared on disconnect or reload. Scripts
running on the same page remain inside the browser's trust boundary. Model
errors, spent budgets and unsupported cross-origin requests leave local flight
and radio commands available.

Subtitles are available throughout flight. In Voice radio settings, enable local
playback, choose a role for preview and adjust the volume. The three characters
have original Mandarin and English event clips with matching captions. Dynamic replies
use captions unless an enabled cloud provider can speak them. See [Voice radio](VOICE.md)
for push-to-talk controls, microphone permissions, speech budgets and browser
support.

The browser tests exercise local dialogue and synthetic provider responses.
For the paid DeepSeek Flash check, serve the production build on port 4175,
set `SKIMMER_REAL_MODEL=1` and provide `DEEPSEEK_API_KEY` in the environment,
then run `node scripts/radio-evidence.mjs`. It records measured orders, scene
facts, reply text and usage. Browser tracing and request headers are excluded.
