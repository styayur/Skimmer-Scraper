# Architecture

## Candidate distribution

The package version appears in the in-game guide and debug bridge. Build provenance
is emitted separately as `build-info.json`, keeping documentation/evidence changes
out of the game JS hash. Static artifacts include the full AGPL text, historical
MIT grant, dependency inventory, runtime/font notices and exact source link.
Source packages retain build provenance when rebuilt outside Git. Packaging never
reads environment variables or private player storage.

Leaving live flight synchronously suspends model work and changes the validation
epoch before the next animation frame. Late replies cannot affect a paused,
failed or replaced session. Gamepad Menu follows the same panel-close/pause path
as Escape. Keyboard and gamepad shortcuts dispatch through `ActionRouter`.
`OverlayManager` owns the visible panel, inerts the background and returns focus
to the control that opened the panel. Moving between panels preserves the original
pause until the player closes the last panel.

## Sky Journey

`SkyJourney` is a fixed-time ASCENT → THRESHOLD → INVERSION → WORLD_SWAP →
DIVE → RECOVERY state machine. A live upward crossing of 520 m is required;
teleporting above it, falling, or exhausting grace in the crossing step cannot
start a transition. Only confirmed transition phases freeze survival time/grace.
The normal animation lasts 3.6 seconds plus asynchronous city preparation. Skip
retains the resource exchange and safe entry; reduced-motion preference or reduced
visual mode removes the extra camera roll.

The composition root releases the renderer's old world reference, disposes the
streamer/BVHs and then constructs exactly one new city. A bounded numeric release
ledger records zero old BVHs/root children before replacement. A cancellation token
guards pending loads; separate run generations stop an older debug advance from
stepping a retried run. Camera, imported player model, companion instancing and
atmosphere survive; world materials, textures and chunks belong to the exchanged
streamer. `planSkyPassage` validates a curved descent and 180 m recovery corridor
with 6.5 m clearance and loaded coverage. It tries the incoming heading first,
then alternate headings, offsets and entry heights. A quaternion maps the
incoming attitude to the exit frame. During the turn the bank stays relative to
the current flight frame, and the curve matches the incoming and
outgoing velocities. The camera rig translates its spring state across the seam.
Local agents keep safe translated offsets or choose nearby covered positions,
then use their usual avoidance during descent and recovery.

`MirrorSky` derives an inverted skyline from the active world seed and palette.
It follows the camera at a fixed offset, uses one batched mesh and frees that
mesh on every world exchange. The world streamer and surface queries never see it.

## Finite imported worlds

`WorldImporter` checks the container, decode budgets and resource references before
loading a GLB. `SceneAnalyzer` retains visual materials and converts solid meshes
to world-space triangles. `ImportedWorldAdapter` uses the existing BVH index for
surface and obstacle geometry. Flight, shields and companions query both, while
proximity and Surface Relay query the surface index. `WorldResourceManager`
keeps the binary and display metadata in separate IndexedDB stores and updates
both in one transaction. See [Local GLB worlds](WORLD-IMPORT.md).
Each generator also owns one shared shadow depth material. Real-GPU lifecycle
instrumentation found a disposed ground map being uploaded again through the
renderer-shared shadow material; per-world ownership releases that sampler state.
The repeated-journey browser test and `journey-memory.mjs` normalize the same base
view after exchanges and verify stable warm texture/geometry/BVH counts.

New world seeds derive from initial seed, ordinal and generator version. World0
retains the exact v0.2 generator settings; five new palette/grammar profiles are
in `journeyWorlds.ts`. New-world plans are invalidated by epoch, while Trust event
history, spent Relay resources and cooldown survive. Cross-world scores use a
separate `sky-journey-v3` suffix. Retry/menu restore the initial world and refresh
starts at world0; a separate optional local unlock records the fifth valid arrival.
The original non-solid light sculpture marks world5. Its small dismissible signature
expires after eight simulation seconds and does not pause flight or require an account.

## Model cooperation boundary

`SymbiosisRuntime` composes plain numeric perception → one shared team request →
strict schema/epoch/TTL/geometry validator → short-lived local steering targets →
flight outcome → bounded memory. Seven declarative actions are supported. No model
output is evaluated as code. Local collision and 120 Hz motion never await a network
request. Cancellation invalidates the world epoch; expired/invalid plans fall back
to the explicitly named local controller. Recorded plans are labelled as replay.
LEAD selects a published directional corridor and refreshes its safe forward route
locally as the pilot moves; SCOUT/HOLD retain bounded fixed waypoints. This avoids
turning a leader back toward an already-passed waypoint after network latency.

Trust starts at 0.5 and changes only through observed lead progress, separation,
regrouping, impacts and verified Relay outcomes. It changes formation spacing,
clearance, allowable planner risk and automatic rescue willingness. Surface Relay
requires an actually covered, deployed partner within 70 m and within 32 m of a
surface, clear line of sight, sufficient Trust, two finite charges and a 20 s
cooldown. Challenge rescue adds at most 1.25 s, capped by configured grace; Free
Flight uses a resource-consuming training effect. Assisted scores stay isolated.

`ModelClient` holds BYOK only in a private runtime field. No key storage, URLs,
telemetry, request/response console logging or GLB data. Disconnect drops the key
and aborts in-flight work. Same-page scripts remain a browser trust boundary.
Official endpoints are pinned; custom HTTPS (or explicit loopback HTTP) endpoints
require a trust checkbox. Redirects fail, credentials/referrers are omitted,
requests are single-flight with timeout/backoff and lifetime call/token limits.
The token reservation is conservative request UTF-8 bytes + 768 per request, not a
billing estimate. Providers may prohibit CORS; there is no implicit key proxy.

Reproduce paid live evidence with `node scripts/model-evidence.mjs` and an
environment-only `DEEPSEEK_API_KEY`. The script disables traces/videos and writes
sanitized numeric traces, usage, latency and decisions. `cooperation-evidence.mjs`
compares no companion, a fixed FOLLOW policy and clearly labelled replay of a real
model decision under the same seed and scripted input. These small samples do not
establish model superiority. Synthetic browser responses only test boundaries.

## v0.3 flight adapters

`RuleConfig` is normalized before takeoff and copied into the pure rule state.
Free Flight and assisted/custom challenges never write the legacy solo score key.
`ControlSettings` shapes keyboard/pad input; the Precision profile is an optional
parameter to pure `stepFlight`, preserving the Classic integrator. Gamepad polling
is a browser adapter with button-edge actions and neutral disconnect fallback.
`resolveShield` sweeps the collision envelope against the existing shared surface
provider, rolls back contact, reflects velocity and validates corner correction.
The renderer consumes impact intensity and owns only the short wireframe effect.
Nose/Cockpit use separate defaults and optional per-model local position anchors;
all first-person modes hide the model while preserving physics.

## Local autonomous companions

`CompanionTeam` owns at most three independent plain flight states. Steering and
swept contact response run at 120 Hz. Staggered 5 Hz perception caches surface
samples and safe-route choices; formation targets move with simulation input.
Predictive relative velocity and separation forces avoid other aircraft. Every
query uses the current shared `WorldStreamer`; agents own no BVH, city generator
or scene object. Uncovered geometry suspends an agent in RECOVER rather than
allowing blind traversal. Debug pose relocation translates the whole team; normal
floating-origin changes affect only rendering.

The player's collision gate remains its original 3×3 ring. Companions check the
loaded cells covering their 60 m perception envelope in that same streamer.
Up to three 80 m follower retention hints enter its existing priority queue,
below player collision coverage and above distant scenery. The 41-chunk cap is
unchanged. A distant agent regroups through a higher clearance corridor before
descending back into formation; it does not freeze because its old cells retire.
Spawn slots require swept path clearance and 11 m separation from the pilot and
teammates; without a valid slot, deployment waits. Debug fixed-time advancement
waits for the actual missing forward coverage and yields to generation tasks;
render frames cannot add extra simulation steps during a scripted advance.

One instanced aircraft mesh shares geometry/material for all three agents. Retry
replaces the bounded state array and clears targets/events (event capacity 256).
Pause/failure stop stepping agents. Count is locked at takeoff to keep solo and
assisted score contexts separate. This controller is explicitly local, not LLM
inference. A later planner can provide short-lived targets without owning physics.

```text
browser input -> FixedStepRunner (120 Hz)
                    |
                    v
              FlightModel.step()  (absolute world coordinates)
                    |
                    v
             WorldStreamer.update()
       active render ring + collision ring
                    |
                    v
         ChunkedWorldAdapter.queryNearest()
           AABB chunks -> per-chunk MeshBVH
                    |
                    v
               RunRules.update()
                |           |
             HUD state   failure/best
                    |
                    v
     GameRenderer (render-origin-local state)
```

## Runtime and simulation

- The game runs a 120 Hz fixed-step simulation through `src/core/fixedStep.ts`.
- `stepFlight(state, input, dt)` is a pure aircraft-state transition. The same input and seed
  produce the same trajectory, independent of render frame rate.
- `KeyboardInputSource` and `ScriptedInputSource` implement the same control contract. Query parameter
  `?debug=1` selects scripted input; the browser debug bridge can set a pose and advance fixed time.
- Rendering consumes snapshots after simulation. Three.js objects never write flight or score state.

## World and spatial queries

- `ChunkGenerator` deterministically emits render geometry and collision geometry in local chunk space.
  Buildings, bridges, ground and floating islands are in the same surface set.
- `WorldStreamer` keeps a 3 x 3 collision ring, a larger visible ring and velocity-directed prefetch
  under a hard active-chunk budget. One chunk is generated per asynchronous task; stale queued work is
  cancelled and in-flight stale results are disposed.
- Stable World supplies revision 0. Ephemeral World is composed from a bounded `ChunkRevisionHistory`;
  activation/retirement callbacks advance a revision only after complete unload. Stable boundary data
  (terrain edges and bridge lines) bypasses revision changes. See [EPHEMERAL.md](EPHEMERAL.md).
- `ChunkedWorldAdapter` accepts dynamic chunk inserts/removals. It first rejects distant chunks with
  AABB distance, then runs `MeshBVH.closestPointToPoint` only on candidates. The nearest hit supplies
  distance, contact point, and chunk/surface identity in absolute coordinates.
- Render geometry is merged by material inside 220 m spatial chunks. The active render root uses a
  floating origin; physics and scoring do not. See [STREAMING.md](STREAMING.md).
- The current query radius is 90 m, larger than the 32 m gameplay surface range so the HUD can show
  a meaningful distance as the player leaves the safe band. The collision ring is not dropped while
  this query range is active.

## Run rules

- A solid surface within 32 m locks the player's proximity state and resets grace to 5 seconds.
- Outside 32 m, grace decreases at simulation time. Re-entering the band restores it immediately.
- Surface contact within the 3.2 m gameplay collision envelope fails the run immediately. The envelope is intentionally fixed across built-in and imported aircraft so survival comparisons remain fair.
- Grace reaching 0 fails the run with a distinct “skyline lost you” state.
- On failure, the browser stores only the best survival time in `localStorage`; there is no account,
  telemetry profile or remote upload.

## Rendering and presentation

- `GameRenderer` creates WebGL2 explicitly. Unsupported browsers get a dedicated error screen.
- The renderer owns ACES tone mapping, directional/hemisphere lighting, fog, bloom, the chase camera,
  procedural aircraft and petal field.
- The DOM UI owns title, HUD, surface-lock meter, failure and aircraft-library surfaces.
- HUD distance and grace come only from the run-rule snapshot. They are not inferred from render
  timing. If collision coverage is unavailable, simulation and rule time pause behind an explicit
  stream-buffering state.

## Deterministic diagnostics

The debug bridge (`window.__SKIMMER_SCRAPER__`) exposes snapshots, start/retry, pose reset and fixed
time advancement when running a debug build. Playwright uses it to reproduce grace expiry and impact
without relying on wall-clock frame rate.

## Local aircraft models

- `src/model/glb.ts` validates the GLB container, rejects external URIs, enforces the 48 MB / 250k
  triangle budgets, and preserves authored materials while normalizing the model to an 8 m envelope.
- `src/model/modelStore.ts` uses browser IndexedDB. Only local model IDs are kept in localStorage.
- `src/model/aircraftLibrary.ts` owns import/remove/rotate/selection semantics. The composition root swaps
  the normalized Three.js root into the existing aircraft mount.
- No model bytes are sent over the network. The Playwright test records requests and asserts that the
  fixture name never appears in a network URL.

## Audio

`src/audio/synth.ts` creates a small WebAudio graph from oscillators and filtered noise. Engine pitch and
level follow simulation speed and boost. The context is created on a user gesture and muted/paused without
changing simulation state.
