# Changelog

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
