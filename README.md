# Skimmer-Scraper

A close-surface 3D flight challenge through an original sakura-dusk megacity. Stay within reach of
the architecture, thread bridges and floating islands, and keep your run alive. There is no account,
no server-side profile and no model upload: imported GLB aircraft stay in your browser.

**Status:** v0.1.0 in development. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for current hosting status.

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
