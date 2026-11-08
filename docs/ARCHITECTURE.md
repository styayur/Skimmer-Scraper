# Architecture

```text
browser input -> FixedStepRunner (120 Hz)
                    |
                    v
              FlightModel.step()
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
              GameRenderer
```

## Runtime and simulation

- The game runs a 120 Hz fixed-step simulation through `src/core/fixedStep.ts`.
- `stepFlight(state, input, dt)` is a pure aircraft-state transition. The same input and seed
  produce the same trajectory, independent of render frame rate.
- `KeyboardInputSource` and `ScriptedInputSource` implement the same control contract. Query parameter
  `?debug=1` selects scripted input; the browser debug bridge can set a pose and advance fixed time.
- Rendering consumes snapshots after simulation. Three.js objects never write flight or score state.

## World and spatial queries

- `generateSakuraMegacity(seed)` deterministically emits render geometry and collision geometry in
  world space. Buildings, bridges, ground and floating islands are in the same surface set.
- Render geometry is merged by material inside 220 m spatial chunks. Collision geometry is merged per
  chunk independently, preserving exact solid surfaces while reducing draw and BVH overhead.
- `ChunkedWorldAdapter` first rejects distant chunks with AABB distance, then runs
  `MeshBVH.closestPointToPoint` only on candidates. The nearest hit supplies distance, contact point,
  and chunk/surface identity.
- The current query radius is 90 m, larger than the 32 m gameplay surface range so the HUD can show
  a meaningful distance as the player leaves the safe band.

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
  timing.

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
