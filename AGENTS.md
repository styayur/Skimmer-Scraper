# Skimmer-Scraper agent guide

## Product contract

Skimmer-Scraper shares one account-free flight client between GitHub Pages and a Windows x64 Tauri 2 application. The player flies an aircraft close to a
continuous procedural city, with optional local GLB worlds. New pilots start in shielded Free Flight
with three local wingmates. Challenge uses surface grace, impact failure and a local personal best.
Keep previous settings, world URLs and score records compatible.

Do not add accounts, remote model uploads, analytics that identify players, or server-side state
without an explicit product decision.

## Hard engineering boundaries

- TypeScript, Three.js, Vite, three-mesh-bvh, Vitest and Playwright.
- WebGL2 is the default and supported renderer. Show a useful incompatibility message when unavailable.
- Simulation is fixed-timestep and deterministic for the same seed and input stream.
- Keep these modules independent:
  - `src/flight`: pure aircraft motion; no DOM, renderer, audio or storage.
  - `src/game`: proximity, collision outcomes, survival timer and restart rules; plain data.
  - `src/world`: world contract, seeded generation and spatial queries.
  - `src/render`: Three.js scene, camera, effects and visual-only animation.
  - `src/audio`, `src/ui`, `src/model`: browser adapters around plain contracts.
  - `src/ai`, `src/voice`: optional browser radio requests, validated orders and bounded audio. The flight loop never waits for a request.
  - `src/main.ts`: composition root only.
- UI reads snapshots. It must not mutate flight or rule state directly.
- Add a deterministic scripted-input path for every simulation behavior that needs regression testing.
- Fixed-step logic must not depend on wall-clock time, `performance.now()` or frame rate.

## Visual and gameplay invariants

- Preserve a distinctive sakura-dusk megacity: peach sky, celadon metal, rose neon, layered
  vertical architecture, bridges, blossoms and floating islands. Avoid replacing authored
  silhouettes with untransformed default boxes.
- Close-surface flight is the point: proximity feedback must be readable at speed without covering
  the view.
- Never make failure ambiguous. Impact and grace expiry have distinct messages and restart affordances.
- Imported GLB models stay on-device. Keep the built-in procedural aircraft available so an import
  failure cannot strand the player.
- Honor `prefers-reduced-motion` for DOM transitions; gameplay camera motion remains necessary but
  should not receive extra decorative shake.

## Assets and references

- Do not copy code or assets from reference projects. Research informs decisions only.
- Every third-party dependency, font, texture, model or sound must be recorded in `CREDITS.md` with
  its source and license. Prefer generated, MIT, CC0 or appropriately attributed CC BY assets.
- Imported player models are local user data and must never be committed or uploaded.
- Do not add unlicensed models to make a screenshot look better.

## Verification and evidence

Run before every phase PR:

```powershell
npm run typecheck
npm test
npm run build
npm run test:e2e
```

For browser checks, use real Chromium through Playwright and inspect screenshots. Compilation alone
is not acceptance. Record machine-readable phase results under `acceptance/`. Clearly separate:

- unit and integration correctness;
- browser/WebGL smoke evidence, which may run on software rendering in CI;
- real-GPU performance evidence, which must name the hardware, browser and measurement method.

Never claim real-GPU performance from CI/headless Chromium.

## Git workflow

- Work in one `codex/` branch per delivery phase. Use the repository's protected checks and native auto-merge.
- Keep generated screenshots and acceptance JSON with the corresponding phase commit.
- Preserve the historical tags, releases and evidence. Stable version tags are reserved for verified builds from the merged release source.

## v0.3 product revision

The authorized v0.3 upgrade adds configurable grace, Free Flight, shields, three camera views, gamepad controls, local/model companions and Sky Inversion. Keep historical solo scores and seeds compatible. Publish production only after release gates pass; an RC must not replace the current site.

## Windows and world packs

Use the platform adapters for native world storage. Keep the flight and rule modules independent of Tauri. Browser exports are player-initiated. Desktop commands operate on application-owned data and validated content IDs. A terrain detail tile may refine rendering only after base collision is ready.

Run Cargo tests and a current-user NSIS installation on a Windows machine for desktop changes. Record the actual WebView2 GPU renderer, source SHA, installer hash and scope of device tests. A production release requires acceptance of both builds from the same merged commit.
