# Stable and Ephemeral worlds

## Modes

- **Stable World** is the default. A chunk always requests revision `0`, so the same seed, preset,
  chunk coordinate and generator version produce the same city.
- **Ephemeral World** remembers that a chunk was visited. After the chunk is fully unloaded, its next
  visit uses a newer interior revision. Active and nearby collision chunks are never rewritten.

URLs carry the mode explicitly:

```text
?seed=phase-4&preset=neon&world=ephemeral&gen=2
```

Stable URLs remain reproducible. Ephemeral URLs reproduce the starting rules and seed, but a world
that has already evolved is session history rather than a permanent shared map.

## Stable boundary data

The following data never receives a chunk revision:

- terrain heights and shared chunk-edge samples;
- global street-grid anchors;
- cross-chunk bridge line enablement and deck height;
- the deterministic spawn safety corridor.

`src/world/stableBoundary.ts` owns the revision-free bridge definition used by `ChunkGenerator` and
exports boundary profiles for regression tests. Buildings, facade details, roofs, decorations,
signage, islands and other interior composition use `chunkRevision`.

## Bounded revision history

`ChunkRevisionHistory` uses an LRU capped at **256 entries**:

1. An unseen chunk receives the current retirement epoch.
2. When it becomes active, its exact revision is recorded.
3. While any part of the chunk remains active, the revision does not change.
4. Complete unload increments that revision and advances the global epoch.
5. A revisit while the entry is retained gets the exact next revision.
6. If the entry was evicted, the unseen/fallback epoch provides a newer revision rather than silently
   restoring stale interiors.

The history is memory-only and page-session-local. This is deliberate: persisting unlimited world
history would violate the local-storage and memory bounds. The exact per-chunk guarantee therefore
covers the most recently used 256 entries; older revisits use the epoch fallback.

## Safety rules

- The streamer invokes revision activation only after a generated chunk is attached to the render
  root and collision adapter.
- Retirement increments history only after the render group, collision BVH and geometry ownership
  have been released.
- A generation cancelled before activation does not count as a completed visit.
- The current collision ring remains active, so a regeneration cannot suddenly place a new building
  over the aircraft.
- Shared terrain, street and bridge boundaries remain stable between different revisions.

## Scores

Personal bests are scoped by:

```text
skimmer-scraper.best.v2:<mode>:<preset>:gen<version>:<encoded seed>
```

Stable and ephemeral maps, presets, seeds and generator versions therefore keep separate local bests.
The v0.1 global best is migrated once into the default Stable / Sakura / generator-2 / default-seed
record. No score or world-history data leaves the browser.
