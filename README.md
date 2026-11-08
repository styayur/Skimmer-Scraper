# Skimmer-Scraper

A close-surface 3D flight challenge through an original sakura-dusk megacity. Stay within reach of
the architecture, thread bridges and floating islands, and keep your run alive. There is no account,
no server-side profile and no model upload: imported GLB aircraft stay in your browser.

**Status:** v0.1.0 release candidate. Close-surface rules, local GLB aircraft, synthesized audio and the visual pass are implemented; final release QA and Cloudflare credentials remain. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for hosting status.

## Play locally

```powershell
npm install
npm run dev
```

Open the URL printed by Vite. A WebGL2-capable desktop browser and a keyboard are recommended.

## Controls

| Input | Action |
| --- | --- |
| W / S or Arrow Up / Down | Pitch down / up |
| A / D or Arrow Left / Right | Roll |
| Q / E | Yaw |
| Shift | Boost |
| R | Instant retry |
| M | Aircraft library |

## Current gameplay loop

- Stay within 32 m of any solid surface to keep the 5 second proximity grace fully replenished.
- Leaving every surface starts the countdown; touching a surface ends the run immediately.
- Survival time and a local personal best are the only score. Press R for an instant retry.
- Imported GLB models remain on-device and use the same flight model and hitbox. See [docs/MODELS.md](docs/MODELS.md).
- Engine and wind audio are synthesized with WebAudio; no audio files are downloaded.


## Commands

```powershell
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run test:all
```

## Architecture

The simulation is split into an independent flight model, a proximity/collision game layer, a
chunked world adapter backed by three-mesh-bvh, and a Three.js renderer. The browser composes these
modules with a fixed 120 Hz simulation step. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## References and licensing

Research references are documented in [docs/RESEARCH.md](docs/RESEARCH.md). No code or assets from
the reference projects are copied. Dependencies and licenses are listed in [CREDITS.md](CREDITS.md).
The project source is MIT licensed.


