# Moving structures

The seeded city places moving gardens, lifts, shuttles and rings within the
active flight region. Their paths are functions of the seed and simulation
time. Retrying starts the paths from the same phase in Stable World mode.
Ephemeral World follows the existing revision rules for unloaded interiors.

Moving structures retain one local-space triangle BVH per collider. The game
interpolates transformations for swept relative motion and computes distances
in world space, including nonuniform scale. The same queries serve the pilot,
wingmates, proximity, shields and Surface Relay. Static geometry remains in
the chunk BVHs. Colliders are released when their world is retired.

In **World → Local GLB**, choose an animation clip, play or pause the preview,
set looping, or assign a custom path to a node. Rigid transforms update
collision during flight. The analyzer labels skinned and morphing meshes that
use a reference-shape collision approximation. You can mark unclear nodes as
surfaces, obstacles or decoration. See [World import](WORLD-IMPORT.md).

The automated tests cover fast crossing against a moving wall, rotation around
a clear ring aperture, nonuniform scale, retry and unload. The moving lift and
garden browser runs are recorded separately. [PR6 acceptance](../acceptance/v0.5/pr6-motion.json)
