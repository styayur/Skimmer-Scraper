# Infinite world streaming

## Runtime model

`WorldStreamer` is the composition boundary between the deterministic chunk generator and the rest of
the game. It owns chunk lifetime, render roots, collision BVHs, floating-origin state and runtime
counters. The flight model and run rules never inspect chunk load states directly.

The collision and render working sets are deliberately different:

| Ring | Default | Purpose |
| --- | --- | --- |
| Collision | 3 x 3 chunks | Guarantees that the current chunk and every immediate neighbour can be queried. |
| Render | 5 x 5 neighborhood plus the forward edge | Supplies nearby visual detail and starts work on the visible side first. |
| Hard active budget | 41 chunks | Bounds render geometry and per-chunk BVH count. |

A chunk is 220 m square. The flight model forecasts 4.5 seconds using the current attitude, velocity,
thrust and eased controls, with a route sample every half-second. The forecast reuses the flight
integration for acceleration, banking and pitch. The active flight continues stepping at 120 Hz.
The scheduler uses this order.

1. The pilot's current collision neighborhood.
2. The next collision neighborhoods along the predicted path. A longer measured activation time
   starts collision prefetch earlier, within a 2.7-second limit for this tier.
3. The safety envelopes around deployed wingmates.
4. Nearby visible terrain, ordered toward the aircraft's heading.
5. The rest of the predicted route and recently used edge chunks when there is room.

Nearby active geometry can stay for up to 1.25 seconds when it leaves the requested set. That gives
the scheduler room to reuse edges after rapid bank reversals and boundary backtracking. Higher
priority cells can reclaim the slot immediately. The active cap stays at 41 chunks. As activation
latency rises, the scheduler reduces peripheral visual detail while giving the safety tiers first
claim on that budget.

## Chunk lifecycle

```text
UNLOADED -> QUEUED -> GENERATING -> ACTIVE -> RETIRING -> DISPOSED
```

- `QUEUED`: desired but not generating.
- `GENERATING`: exactly one inline generation task is allowed in flight in v0.2.
- `ACTIVE`: render group is under the streamed root and the local collision geometry has a BVH.
- `RETIRING`: the chunk left the desired set while generation was still in flight. The same request
  can return to `GENERATING` if the aircraft turns back before it finishes. Otherwise its result is
  disposed when it arrives.
- Queued chunks that become stale are removed before generation starts.
- Revisiting a chunk never creates a duplicate active record; the chunk key is `chunkX:chunkZ`.

The current source yields one browser task before synchronously building one chunk. This prevents the
whole city from being generated in a physics tick. Source generation time includes the browser task
yield. Total activation time also includes creating the collision BVH and attaching the render group.
Geometry size and mesh counts are measured when a chunk activates and reused for runtime statistics.

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
  estimated CPU geometry bytes, retirement/disposal counts and generation timing. The p95 value is the
  sample at `floor(count * 0.95)`, clamped to the last sample. It is not assumed to be greater than or
  equal to the average: a few very slow generations can pull the mean above that order statistic.

Disposal counters prove that repository-owned geometry was released. They do not prove that the GPU
driver reclaimed every allocation. Real GPU memory profiling remains a separate hardware gate.

## Automated evidence

- `tests/unit/worldStreamer.test.ts` runs a deterministic 15-minute curved flight, checks the active and
  BVH bounds, forces A -> B movement, tests priority and edge retention, cancels an in-flight generation
  and verifies geometry disposal.
- `tests/e2e/world-streaming.spec.ts` exercises the real browser scene, verifies the load HUD while
  buffering is true, checks that buffering freezes the run timer, checks the hard chunk budget and
  validates a 10,000 m floating-origin rebase.
- `evidence/v0.2/phase-3-runtime.json` records the observed counters and Playwright/SwiftShader caveat.
