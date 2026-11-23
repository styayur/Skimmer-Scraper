# Seeded world generation

## Seed format

- Numeric seeds accept decimal or `0x` hexadecimal.
- Other strings are hashed with a stable 32-bit FNV-style function.
- The default seed is `334458` (`0x51A7A`).

## URL parameters

```text
?seed=334458&world=stable&gen=4
```

- `seed` — numeric or textual world seed.
- `world` — `stable` or `ephemeral`. Stable is the default and remains reproducible.
- `gen` selects the geometry used by the seed. New games use generator 4. A share saves the active version, including versions 2 and 3.

The world panel can randomize a seed, copy the raw seed, copy a complete share URL and restore the
default seed. Applying a world reloads the static app with the same URL parameters, which keeps GitHub
Pages project paths intact.

Version 2 links keep their original seed, preset and mode. Links with seed, preset or
world parameters and no generator version also open version 2. The world panel shows the
legacy preset and can use the same seed in the current city. Explicit version 3 links reproduce the v0.6.0 city. Legacy preset shares continue to include
`preset`. Player records are scoped by generator version, so a version 2 record remains
available on the corresponding legacy link. To open the old default city, use
`?seed=334458&preset=sakura&world=stable&gen=2`. Older release tags retain their original
runtime and resources.

## Generation identity

Every chunk is generated from:

- world seed;
- chunk X and Z;
- generator version;
- optional chunk revision;
- resolved city configuration.

No generator path relies on global `Math.random()` or on the order in which chunks are requested.

## Configuration surface

`CityGenerationConfig` exposes building density, building-height range, street spacing, bridge frequency,
floating-island frequency, suspended-structure heights, terrain amplitude, architectural variation, fog
density and far-detail density. Version 3 samples independent continuous fields for towers, bridges,
and gardens. Dense canyons, layered bridge districts, floating gardens and open terraces share the
global street grid. Each of the five Sky Inversion worlds adds its own seed, palette and architectural
emphasis while keeping urban density. Version 4 adds shared loft profiles, world-specific tower silhouettes, flying garden pavilions and a moving orbital station to these districts. [Architecture and visual evidence](WORLD-ART.md)

## Continuity

- Terrain samples use global coordinates; adjacent ground tiles share exact edge heights.
- Streets are anchored to a global spacing grid.
- Cross-chunk bridges use a line index, direction and seed to derive the same deck heights on both sides.
  Overhead decks use separated height bands, and offset supports leave a clear route along the street center.
- Buildings are contained within global lots and the spawn corridor is deterministic and clear.
- Version 3 floating islands stay inside their producing chunk and above its actual solid structures.
- Generation tests compare repeated fingerprints, reversed generation order and adjacent terrain edges.

## Streaming

The runtime no longer generates the complete 5 x 5 world during boot. `WorldStreamer` maintains a
collision ring, a larger render ring and predictive prefetch based on motion and controls. Recent
nearby chunks can stay briefly to support backtracking. See [STREAMING.md](STREAMING.md) for lifecycle,
coordinate, buffering and resource-accounting details.

## Mirror city

The renderer builds a small upside-down skyline from the active procedural
world's seed and district fields. Its foundations meet a continuous ground
with a street grid and an atmospheric edge that fades into the current sky
palette. The ground follows camera translation in world-aligned sky space
as the player climbs, dives or rolls. The existing atmosphere shader draws the
ground without a separate mesh or pass. The skyline and ground use the physical
world's seed and palette and contribute zero collision surfaces or BVHs.

## World memory modes

Stable World always uses revision 0. Ephemeral World advances a chunk revision only after complete
unload, using a 256-entry LRU history and a global epoch fallback. Stable terrain, street anchors and
bridge definitions never include the revision. See [EPHEMERAL.md](EPHEMERAL.md).
