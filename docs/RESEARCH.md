# Research notes

Reviewed 2026-11-08. Research is not asset transfer.

## Skyward — flight feel and camera

Observed product decisions from the public README and source:

- velocity aligned to the nose with scalar airspeed creates an immediately legible arcade flight model;
- a pure `step(state, input, dt)` contract makes repeatable tests possible;
- chase-camera distance and FOV follow speed while vertical framing lags slightly;
- procedural low-poly aircraft are both an art choice and a practical way to keep load time low.

Adopted only as general principles: separate flight simulation from rendering, test pure state
transitions, widen framing with speed, and keep aircraft geometry original. Skyward has no detected
reusable license, so no implementation or visual detail was copied.

## Neon Zenith — vertical city and spatial index

Observed architecture:

- a continuous city is generated from street/lot grammar rather than placed as isolated props;
- repeated facade/props use instancing and distance-based LOD;
- CPU queries use broad city layout/height information, while GPU-facing visuals use large batched
  groups;
- authored landmark districts coexist with procedural outer districts.

For Skimmer-Scraper we choose a simpler v0.1 implementation: deterministic district generation,
render geometry merged by material into spatial chunks, and exact nearest-surface queries against
per-chunk BVHs. AABB pruning avoids testing every chunk. This is an independent implementation.
We do not copy Neon Zenith source, and its art assets are not reused.

## Sakura Fantasy — environment art

Observed art direction:

- strong seasonal color story rather than generic neutral realism;
- mist and depth layers separate environmental planes;
- reflected/warm lantern light creates focal rhythm;
- vegetation silhouettes carry much of the identity.

Skimmer-Scraper translates those principles into an original aerial setting: peach dusk gradients,
celadon towers, rose neon, pale blossom clouds, water channels and floating garden islands. All
geometry and textures in this repository are generated in code or authored for this project.

## Accepted shortcuts and boundaries

- No external city model: the v0.1 city is procedural but combines setback massing, lantern crowns,
  sky bridges, cable work, facades, blossom canopies and floating islands. It is not a placeholder
  grid of plain cubes.
- No real-GPU benchmark in CI: headless Chromium uses software rendering. Real hardware performance
  must be measured separately and is reported with its environment.
- No cloud deployment claims without credentials. See `docs/DEPLOYMENT.md`.
