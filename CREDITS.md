# Credits and licenses

## Project code and generated art

- Skimmer-Scraper source code and original procedural world/aircraft geometry: MIT, © 2026 styayur.
- Sky, facade textures, signage, blossom, particles, aircraft materials, engine sound and wind noise
  are generated at runtime by this repository. Imported GLB files remain user-owned local data and are
  not shipped with the game. 	ests/fixtures/test-aircraft.glb is an original synthetic test fixture.
- src/audio/synth.ts contains an original WebAudio engine/wind synthesis graph; no audio recordings are
  bundled.

## Runtime and build dependencies

| Package | Version | License | Use |
| --- | --- | --- | --- |
| [three](https://github.com/mrdoob/three.js) | 0.187.0 | MIT | WebGL2 scene graph and rendering |
| [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh) | 0.9.18 | MIT | exact closest-surface queries |
| [Vite](https://github.com/vitejs/vite) | 8.3.6 | MIT | development server and static build |
| [Vitest](https://github.com/vitest-dev/vitest) | 5.1.0 | MIT | unit/integration tests |
| [Playwright](https://github.com/microsoft/playwright) | 1.65.0 | Apache-2.0 | browser interaction and screenshot tests |
| [TypeScript](https://github.com/microsoft/TypeScript) | 7.0.2 | Apache-2.0 | type checking |
| [Wrangler](https://github.com/cloudflare/workers-sdk) | 4.158.0 | MIT OR Apache-2.0 | Cloudflare Pages deployment CLI |
| [fake-indexeddb](https://github.com/dumbmatter/fakeIndexedDB) | 6.2.7 | Apache-2.0 | IndexedDB tests |
| [Syne](https://fontsource.org/fonts/syne) | 5.3.0 | SIL OFL 1.1 | display typography |
| [IBM Plex Sans](https://fontsource.org/fonts/ibm-plex-sans) | 5.3.0 | SIL OFL 1.1 | interface typography |

Exact transitive dependency versions are recorded in `package-lock.json`; their license terms remain
in their respective packages. Font files are distributed through Fontsource under the SIL Open Font
License 1.1.

## Research references

These works informed product and engineering decisions. Unless explicitly noted below, no code,
meshes, textures, shaders, audio or other assets from them are included here.

- **Skyward** by xpereta — <https://github.com/xpereta/skyward>. Studied arcade flight feel,
  deterministic pure simulation boundaries, chase-camera framing and procedural aircraft presentation.
  The repository exposes no reusable license at the time of review (license API returned 404).
  Therefore **no Skyward code, visuals or assets are copied or adapted**.
- **Neon Zenith** by Bill Chan — <https://github.com/billpwchan/neon-zenith>. MIT source license;
  project assets retain separate terms. Studied vertical-city composition, instancing/LOD, facade
  grammar and CPU spatial indexing/height-query ideas. This project uses an independently designed
  chunked AABB + BVH nearest-surface adapter and does not copy Neon Zenith code or assets.
- **Sakura Fantasy** by Bill Chan — <https://github.com/billpwchan/sakura-fantasy>. MIT source
  license; project assets retain separate terms. Studied environment art direction: seasonal sakura
  color, atmospheric depth, water/lantern light and restrained UI. No code, textures, models, audio
  or other assets are copied.

See [docs/RESEARCH.md](docs/RESEARCH.md) for the concrete design conclusions and rejected shortcuts.

