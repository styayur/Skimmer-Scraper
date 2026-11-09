# Seeded world generation

## Seed format

- Numeric seeds accept decimal or `0x` hexadecimal.
- Other strings are hashed with a stable 32-bit FNV-style function.
- The default seed is `334458` (`0x51A7A`).

## URL parameters

```text
?seed=334458&preset=sakura&world=stable&gen=2
```

- `seed` — numeric or textual world seed.
- `preset` — `sakura`, `neon`, `archipelago` or `randomized`.
- `world` — `stable` or `ephemeral`. Stable is the default and remains reproducible.
- `gen` — generator version in shared links. The runtime currently resolves generator version 2.

The world panel can randomize a seed, copy the raw seed, copy a complete share URL and restore the
default seed. Applying a world reloads the static app with the same URL parameters, which keeps GitHub
Pages project paths intact.

## Generation identity

Every chunk is generated from:

- world seed;
- chunk X and Z;
- generator version;
- optional chunk revision;
- resolved preset configuration.

No generator path relies on global `Math.random()` or on the order in which chunks are requested.

## Configuration surface

`CityGenerationConfig` exposes building density, building-height range, street spacing, bridge frequency,
floating-island frequency, suspended-structure heights, terrain amplitude, architectural variation, fog
density and far-detail density. Presets reuse the same geometry language so all seeds retain the
Skimmer-Scraper visual identity.

## Continuity

- Terrain samples use global coordinates; adjacent ground tiles share exact edge heights.
- Streets are anchored to a global spacing grid.
- Cross-chunk bridges use a line index, direction and seed to derive the same deck height on both sides.
- Buildings are contained within global lots and the spawn corridor is deterministic and clear.
- Floating islands are kept inside their producing chunk and above the preset's maximum building height.
- Generation tests compare repeated fingerprints, reversed generation order and adjacent terrain edges.

## Streaming

The runtime no longer generates the complete 5 x 5 world during boot. `WorldStreamer` maintains a
collision ring, a larger render ring and a velocity-directed prefetch corridor while disposing chunks
that leave the desired set. See [STREAMING.md](STREAMING.md) for lifecycle, coordinate, buffering and
resource-accounting details.

## World memory modes

Stable World always uses revision 0. Ephemeral World advances a chunk revision only after complete
unload, using a 256-entry LRU history and a global epoch fallback. Stable terrain, street anchors and
bridge definitions never include the revision. See [EPHEMERAL.md](EPHEMERAL.md).
