# Infinite world streaming

## Runtime model

`WorldStreamer` is the composition boundary between the deterministic chunk generator and the rest of
the game. It owns chunk lifetime, render roots, collision BVHs, floating-origin state and runtime
counters. The flight model and run rules never inspect chunk load states directly.

The collision and render working sets are deliberately different:

| Ring | Default | Purpose |
| --- | --- | --- |
| Collision | 3 x 3 chunks | Guarantees that the current chunk and every immediate neighbour can be queried. |
| Render | 5 x 5 chunks plus directional prefetch | Supplies visible detail around the aircraft and along its projected path. |
| Hard active budget | 41 chunks | Bounds render geometry and per-chunk BVH count. |

A chunk is 220 m square. At the 116 m/s maximum flight speed, the streamer predicts roughly four
seconds ahead plus measured generation latency. The horizon is capped at 720 m and uses the current
velocity direction, so it follows straight lines and curves without relying on an untested fixed
preload ring.

## Chunk lifecycle

```text
UNLOADED -> QUEUED -> GENERATING -> ACTIVE -> RETIRING -> DISPOSED
```

- `QUEUED`: desired but not generating.
- `GENERATING`: exactly one inline generation task is allowed in flight in v0.2.
- `ACTIVE`: render group is under the streamed root and the local collision geometry has a BVH.
- `RETIRING`: the chunk left the desired set while generation was still in flight. Its result is
  disposed instead of being attached to the scene.
- Queued chunks that become stale are removed before generation starts.
- Revisiting a chunk never creates a duplicate active record; the chunk key is `chunkX:chunkZ`.

The current source yields one browser task before synchronously building one chunk. This prevents the
whole city from being generated in a physics tick, but it is not a Web Worker. Chunk generation time
is measured and exposed so the remaining main-thread cost is visible rather than hidden.

## Collision safety and buffering

Before a fixed step is committed, the streamer must report complete coverage for the current 3 x 3
collision ring. The next position is checked as well. If coverage is missing, simulation time, the
grace timer and the survival timer pause; the HUD displays `WORLD STREAM / 区块缓冲`. No empty-space
grace failure is emitted while collision data is unavailable.

Because the flight model's maximum travel per rendered frame is well below one 220 m chunk, the active
collision ring is conservative. Debug advancement pauses and waits for coverage at bounded intervals
instead of bypassing the same gate.

## Floating origin

Physics and scoring remain in absolute coordinates. Render geometry and camera-space flight state use
a local coordinate frame:

```text
local = absolute - renderOrigin
hitPoint = localBVHHit + chunkOrigin
```

When absolute X or Z crosses 12,000 m, the render origin snaps in 10,000 m increments. Chunk groups and
camera interpolation state shift by the returned delta. Flight position, velocity, chunk identity,
seed, query distance and scoring do not change.

## Resource ownership

- Shared world and billboard materials are owned by `ChunkGenerator` and survive chunk churn.
- Each active chunk owns its render geometries and one collision geometry.
- Retiring a chunk removes its root group, removes its adapter entry, disposes render/collision
  geometry and drops the BVH reference.
- `WorldStreamer` reports active chunks, queued/generating counts, BVH count, render-object count,
  estimated CPU geometry bytes, retirement/disposal counts and generation p50/p95 proxies.

Disposal counters prove that repository-owned geometry was released. They do not prove that the GPU
driver reclaimed every allocation. Real GPU memory profiling remains a separate hardware gate.

## Automated evidence

- `tests/unit/worldStreamer.test.ts` runs a deterministic 15-minute curved flight, checks the active and
  BVH bounds, forces A -> B movement, cancels an in-flight generation and verifies geometry disposal.
- `tests/e2e/world-streaming.spec.ts` exercises the real browser scene, verifies buffering freezes the
  run timer, checks the hard chunk budget and validates a 10,000 m floating-origin rebase.
- `evidence/v0.2/phase-3-runtime.json` records the observed counters and Playwright/SwiftShader caveat.
