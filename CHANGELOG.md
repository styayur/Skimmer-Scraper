# Changelog

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
