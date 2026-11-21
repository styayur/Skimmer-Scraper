# Local GLB worlds

Open **World** (`G`) and expand **Local GLB worlds**. Choose or drop a self-contained glTF 2.0 GLB, analyze it, and enable it. The title screen then opens with the chosen scene ready for a new run. Edit scale, up axis and yaw before enabling. The analysis shows the automatic spawn coordinates. Use manual coordinates to start inside a street or below a bridge. The game rejects spawn points with insufficient clearance along the first 22 m of flight.

The model can stay available for the session or be saved in the browser. After reload, open the saved world from the library. Procedural share links still select the indicated procedural seed. World files, settings and save manifests never leave the browser. Draco and KTX2 decoder binaries come from the same deployment. Meshopt is loaded with the import code.

## Collision and proximity

The visual scene retains its original meshes and materials. The import builds local triangle indices after applying the scene scale, rotation and origin. The finite world has complete collision coverage and uses no chunk streaming or Sky Inversion. Free Flight can continue beyond the scene. Challenge still uses the ordinary proximity range and grace timer. Saved records for imported scenes have their own score keys.

| Mesh role | Collision | Proximity and Surface Relay |
| --- | --- | --- |
| `SURFACE` | Yes | Yes |
| `OBSTACLE` | Yes | No |
| `DECORATION` | No | No |

Asset authors can set `extras.skimmerRole` or `extras.skimmer.role` on a mesh node or its parent. Common skybox, skydome and backdrop names are recognized. Other meshes default to surface. Inspect the list and set uncertain meshes manually. **Show collision layer** draws cyan surface triangles and orange obstacle triangles. Returning to the procedural city releases the imported GPU resources and BVHs. Retry reuses the current world.

## Format and resource bounds

The importer accepts self-contained GLB 2.0. PNG, JPEG, WebP and two-dimensional KTX2 are checked for dimensions before decode. Draco, Meshopt and Basis Universal decoders run locally. Saving a world retains its original GLB bytes and animation settings.

## Animation and custom routes

The first detected clip plays by default. In **Animation and motion paths**, select a clip, use its reference pose, or disable looping. Inspect the motion type and select a mesh to add a smooth out-and-back route. Offsets use the mesh parent's original coordinates. An asset can supply the same local route in `extras.skimmerMotion` or `extras.skimmer.motion` as `{ "offset": { "x": 32, "y": 0, "z": 0 }, "seconds": 8 }` on a mesh node. File assets with neither animation nor custom paths stay still.

Rigid translation, rotation and scale move both the visual mesh and its collider. Skin and morph animations use the reference mesh shape for collision. The import panel marks those approximations. During flight, **Play world animation** pauses or resumes object motion. Before takeoff, **Preview** plays the scene around the start area. Retry resets the animation clock to zero. The limit is 128 active rigid collision meshes per imported world.

A world can use up to 128 MiB of GLB data, 2,500 nodes, 1,250,000 rendered triangles counting repeated instances, 256 materials and 128 textures. Width and height are limited to 8192 pixels per texture and decoded base images to 50,331,648 pixels total. The transformed solid scene can span up to 12,000 m on its longest axis. The separate local world library can keep six worlds within a combined 256 MiB. Larger imports show resource usage and offer cancellation before activation.

Collision ownership, moving structures and test evidence are described in
[Moving structures](DYNAMIC-WORLD.md). [Aircraft models](MODELS.md) have a separate library.
