# v0.3 licensing provenance

Audit baseline: e9a2c2cd6d722e1bb92bc67b263f731a4c8da2a2. Git history identifies
styayur as the original application contributor; the other author is Dependabot,
whose changes update dependency metadata and Actions pins. No separately authored
third-party application source was found. The repository owner expressly authorized
the v0.3 migration. No code or assets were imported from reference games.

New project releases are AGPL-3.0-only. The complete GNU license is in LICENSE,
downloaded from https://www.gnu.org/licenses/agpl-3.0.txt. The previous MIT notice
and permission grant are retained in licenses/PROJECT-MIT-v0.2.0.txt and apply to
the previously distributed code. Historical MIT permissions are not revoked.
v0.1.0 and v0.2.0 tags/releases are preserved.

Third-party components retain their own terms, copyright notices and attribution.
Installed package license metadata is inventoried in licenses/DEPENDENCIES.json;
runtime dependencies use MIT and the bundled fonts use OFL-1.1. Development tools
include Apache-2.0 and other permissive licenses. Their notices remain in their
packages. Player-imported GLBs are local user data, not relicensed project assets.

The live UI links the complete corresponding source repository. Modified network
deployments must satisfy AGPL section 13. Contributors must have authority to
submit their work under AGPL-3.0-only and preserve third-party notices.

The v0.3 candidate static build now emits the full LICENSE, CREDITS and all
licenses/ notices/inventory, and pins its source link to the exact build commit.
Both project license texts and runtime/font notices are verified through HTTP
by the distribution browser test. No reference-game code or assets were copied.

## v0.9 character radio, music and geometry

The shipped Opus clips are offline renders of the original English script in
`art/radio/lines.json`. They use the CMU US SLT voice and ship its original
notice in `licenses/CMU-ARCTIC-SLT.txt`. The authoring scripts use Flite and
opus-tools. The game distributes the rendered clips. Music for the four
world pools is composed by `art/music`. The Unicode selector is a TypeScript
port from mzk with the upstream MIT notice in `licenses/MZK-MIT.txt`.
The WorldForge prototype and both aircraft are project assets. Their
generation and modelling sources are included under `art/`. The release
verifier compares each distributed audio file with the corresponding source.

## Historical v0.6 browser voice

Kokoro JS, Transformers.js and the downloadable ONNX weights and Mandarin
embeddings carry Apache-2.0. ONNX Runtime Web, its common JavaScript bindings,
`pinyin-pro` and Hugging Face's Jinja implementation carry MIT. The
published model and converted voice files are pinned by revision. The
application includes the browser inference runtime with its upstream notices.
The program's English fallback uses OS speech. The build aliases Kokoro's
optional English phonemizer to the project's Mandarin-only boundary, so the
npm-installed GPL eSpeak component and its WebAssembly are absent from the
distributed game. The Node inference backend and image tooling remain
lockfile dependencies of Transformers.js and are excluded from the static build.

The audio queue, interruption and idle release design drew on Siny
(`a31619ba641e64b9d9ff572257e4ca52f66e91f6`). The runtime implementation is
original browser TypeScript and ships no Siny code, native executables or
model files. The project retains the previous MIT notice and AGPL-3.0-only.
