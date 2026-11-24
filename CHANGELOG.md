# Changelog

## 0.8.1

- City chunks prepare geometry and collision indices in a worker. Prefetching covers the view and the flight path, with collision taking priority.
- Dragonspine schedules visual tiles against the current device, quality preset and frame load. A bounded cache reuses recently decoded tiles.
- Kokoro reuses short phrases across idle worker shutdowns. After an inference stalls flight, uncached replies can use an available local voice when the pilot enables fallback.
- Windows can download, cancel, verify, repair and remove the official Dragonspine High Pack. The installer checks disk space, the release digest and each tile before replacing the installed pack.
- Desktop settings show WebView2 and the latest stable version, open official release notes, move the world library, and export or import pilot saves. Windows updates use manual installation. The NSIS installer is unsigned.

## 0.8.0

- Shared Windows x64 Tauri client, per-user NSIS build, fullscreen and window-focus controls.
- Native transactional GLB library, player-initiated export and independently installed terrain packs.
- Dragonspine Realm, cloud sea, floating shrines, natural arches and animated dragons with near-flight collision proxies.
- Predictive terrain detail loading with bounded residency and shared collision across platforms.
- Reduced in-flight text, full and fast Sky Inversion transitions and fifth-crossing records in the tutorial.


## Unreleased

## 0.7.0 — 2026-11-23

- Generator 4 brings open moon gates, folded towers, terraced orchards, lantern courts and needle exchanges to the infinite city. Regional landmarks, sky gardens, layered bridge spans and moving orbital stations share the Blender district’s loft profiles.
- The five Sky Inversions have distinct architecture. Overhead viaducts connect hanging courtyards, and the atmosphere follows the camera during climbs and origin changes.
- Existing generator 2 and 3 links retain their historical collision geometry. New cities use generator 4 with the existing 220 m streamer and fixed-step flight.
- The editable Blender scene, Geometry Nodes bridge controls, generating script and importable demonstration GLB are included in the source distribution. [Art and flight measurements](docs/WORLD-ART.md)

## 0.6.0 — 2026-11-23

### Added

- A continuous atmospheric ground plane for the mirrored city above the flight world.
- Predictive chunk preparation for high-speed flight and rapid turns, with priority for collision coverage, wingmates and the nearby view.
- Portable seeds for generated GLB layouts. Keep a layout, or replay it with the same imported GLB and import configuration.
- Default system speech with distinct wingmate roles, a speech volume control and voice previews.
- Opt-in Mandarin Kokoro synthesis on compatible WebGPU hardware, with resumable downloads, SHA-256 verification and idle model release.

### Changed

- The title offers direct entry to flight or the searchable 19-chapter tutorial. Contextual help links settings to matching chapters.
- Hardware or network failures in local Kokoro can fall back to system speech or subtitles. Windows Firefox uses the fallback before downloading model weights.
- The stable release archives use the exact manually deployed Pages distribution and its corresponding source.

## 0.5.0

### Added

- In-game guide, common action routing and keyboard, touch and controller navigation.
- A dense unified city with layered corridors, moving gardens, lifts and rings.
- Local GLB world importing, spawn and semantic controls, rigid animation collisions and saved world slots.
- Companion callsigns, dialogue, validated flight commands and feedback from actual wingmate movement.
- Optional push-to-talk, on-device speech and direct DeepSeek ASR, model dialogue and streamed TTS with memory-only BYOK.

### Changed

- New pilots begin in shielded Free Flight with Precision controls, Chase and three wingmates. Chase and Cockpit share per-aircraft anchor presets. Old Nose preferences migrate to Cockpit.
- Sky Inversion carries the camera, aircraft attitude and formation through a checked exit corridor. Distant mirrored skylines follow the world seed.
- Legacy generator links still resolve to their original layouts and score keys.
- GitHub Pages is deployed by a manual workflow run from `main`. Stable tags identify the verified deployed commit.

## 0.3.0-rc.1 — 2026-11-21

### Added

- Challenge grace from1–15 seconds in0.1s steps, Free Flight, swept physical shield,
  isolated custom/assisted/journey scores and preserved historical solo records.
- Precision/Classic flight, three camera views, per-model first-person anchors,
  configurable keyboard/gamepad response, mappings, hotplug and optional haptics.
- Up to three independent local companions sharing the streamed collision world,
  with formation, leading, regrouping, avoidance and recovery.
- Optional structured model planning, bounded outcome memory, observable Trust,
  finite geometry-checked Surface Relay and memory-only BYOK with validation,
  timeouts, budgets, cancellation and local fallback. Genuine API evidence is
  separate from synthetic fixtures and recorded-plan experiments.
- Sky Inversion, five reproducible world profiles, safe formation entries,
  skip/reduced rotation and a local fifth-sky signature with continued flight.
- Automated/browser/real-GPU evidence, license/source provenance in distributions
  and deterministic candidate packaging.

### Changed

- New releases use AGPL-3.0-only. Historical MIT grants, notices and both old
  releases remain available; dependency/font licenses remain independent.
- Stable version tags control Pages. Phase merges and RC tags preserve production.

### Fixed

- Bridge collisions after arrival, shadow texture retention, stale world/model
  plans, retry cancellation, rejected audio resume and gamepad Menu over panels.

### Candidate limits

- Human controls/art/AI teamwork and transition pacing await review. Explicit
  capture windows measured58.3ms max; earlier PNG-inclusive peaks are not used
  to infer gameplay-only stalls. Physical gamepad judgment is not claimed.
- OpenAI live authentication was unavailable; actual model evidence uses DeepSeek
  Flash/V4 Pro. No hosted inference service or bundled key is provided.

### Removed

- Cloudflare Pages deployment. The dedicated workflow, Wrangler config, and deploy script are removed.
  GitHub Pages remains the public host. No Cloudflare deployment is claimed.

### Fixed

- The world-streaming browser test now records the load HUD while buffering is true, instead of
  checking that transient label after the load can already have finished.
- Generation p95 is checked as an order statistic. It is not assumed to be greater than or equal to
  the average, which a heavy tail can pull above the 95th percentile.

## 0.2.0 — 2026-11-09

### Added

- Seeded, reproducible city presets and shareable `seed`, `preset`, `world` and generator-version URLs.
- Continuous proximity feedback, comfort mode, configurable dynamic FOV, chase/cockpit views and a
  dismissible recording hint.
- On-demand 220 m chunk streaming with a collision ring, velocity-directed prefetch, dynamic per-chunk
  BVHs, explicit buffer pauses and floating-origin rendering.
- Deterministic 15-minute streaming simulation, in-flight cancellation coverage and browser evidence
  for chunk replacement, BVH bounds and geometry retirement counters.
- 30/60/144 FPS fixed-rule consistency tests and a headed real-GPU benchmark on AMD Radeon 780M.
- Optional Ephemeral World mode with a 256-entry bounded LRU revision history, stable terrain/bridge
  boundaries, session-local forgetting and scenario-isolated personal bests.
- Stable/Ephemeral world selector and share links carrying mode, seed, preset and generator version.

### Notes

- Automated browser evidence uses headless Chromium and may run on SwiftShader. Real-GPU performance
  is recorded separately and is never inferred from software rendering.

## 0.1.0 — 2026-11-08

Initial public release candidate.

### Added

- Original sakura-dusk procedural megacity with buildings, roofs, bridges, ground, canals, floating
  islands, waterfalls, facades, billboards, blossoms and rooftop gardens.
- Fixed-step arcade flight model with pitch, roll, yaw, boost, chase camera, speed ribbons and WebAudio.
- Exact per-chunk `three-mesh-bvh` nearest-surface queries behind an AABB broad phase.
- 32 m surface-lock band, 5 second grace timer, 3.2 m aircraft collision envelope, impact and
  grace-expiry failure states.
- Local-only best score and instant retry.
- Browser-local GLB import with strict validation, IndexedDB persistence, 180° rotation and removal.
- WebGL2-unavailable fallback UI.
- Unit, browser and release acceptance suites with committed screenshots and machine-readable evidence.
- Cloudflare Pages and GitHub Pages deployment workflows.

### Known limitations

- Cloudflare Pages production deployment awaits account authorization and repository secrets.
- CI/headless evidence runs on SwiftShader; there is no real-GPU performance certification in v0.1.0.
- Draco and Meshopt compressed GLB extensions are not included.
- Keyboard is the primary input on desktop; touch flight controls are not part of v0.1.0.
