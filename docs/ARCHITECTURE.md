# Architecture

Implementation details are filled in as each phase lands. The stable boundaries are:

```text
browser input -> FlightModel.step() -> RunRules.update() -> HUD snapshot
                      |                    |
                      |                    +-> ChunkedWorldAdapter -> three-mesh-bvh
                      +-> Renderer snapshot
```

## Simulation

- 120 Hz fixed step, capped catch-up.
- A deterministic input source can reproduce runs independently of frame timing.
- Flight state uses plain numeric data; the renderer applies it to Three.js objects.

## World

- The world generator returns render groups plus solid geometry used for collision.
- Buildings, roofs, ground, bridges and islands are valid surfaces.
- A chunk grid rejects distant geometry before exact BVH closest-point queries.

## Rules

- A surface lock within the configured range resets the 5 second grace timer.
- An exact surface distance at or below the aircraft collision radius ends the run immediately.
- Survival time and local personal best are the only persistent score.

## Rendering

- WebGL2 by default, with a clear unsupported-browser state.
- The renderer owns atmosphere, post-processing, particles, chase camera and aircraft presentation.
- Imported/local GLB aircraft are normalized for framing but otherwise preserve their authored
  materials and silhouette.
