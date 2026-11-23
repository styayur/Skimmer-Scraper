# World art and flight geometry

The original Blender district occupies 220 × 220 m. Its tallest component reaches 160.76 m from the bottom of the plaza. The GLB importer counted 9,420 triangles and one keyed station rotation. The two piers of the moon gate define a northbound passage. A lower bridge meets its west pier and an upper bridge meets its lintel. Sloped tower shoulders, offset roof gardens and dark glass fins make separate landmarks readable against the dusk sky.

The editable scene, generating script and material assignments are in [art/district](../art/district/README.md). Rebuilding the district with Blender 5.2.4 on Windows reproduced the GLB and profile file byte for byte. Blender is an authoring dependency. A locked npm build consumes the committed profiles without launching Blender.

| World | Dominant structure |
| --- | --- |
| Sakura dusk | District-dependent gate, needle exchange or terraced orchard |
| 钴蓝霓虹 | Three folded fins with stepped heights and forward glazing |
| 翡翠群岛 | Asymmetric orchard terraces with recessed tree platforms |
| 紫藤桥庭 | Twin piers, an intermediate crossing and a roof lantern |
| 琥珀高城 | Sloping needle towers and a shared elevated exchange |
| 金穹归航 | Open moon gates with an offset glazed crown |

Generator 4 varies lot width, depth, height and orientation. District fields extend over several chunks. A dominant silhouette recurs among other building types in each region. Selected landmarks occupy more of their lot. Pavilion islands keep a margin from chunk edges and clearance above towers and decks. The motion registry places moving architecture in larger regions. Its BVHs follow the same fixed-step transforms as the rendered meshes.

Shared loft prototypes are assembled once per world. Material batching keeps repeated windows, trusses and blossoms in the chunk meshes. The camera-relative inverted city uses a simpler mesh with four rings of hanging courts. Overhead scenery is visual only. A camera-relative atmosphere keeps the far clip plane clear during origin shifts and high approaches.

## Reproduce the visual check

Run the v0.6.0 tag and the candidate on separate local preview ports. Pass each preview URL to `node scripts/capture-world-art.mjs <url> <generator> <directory>`, using `3 v060` and `4 pr4`. Run `python scripts/compare-world-art.py` with Pillow to assemble the comparison. Both runs use headed Chrome and the same seed, viewport and requested poses. Read the camera transforms in the accompanying JSON to compare the actual views.

The screenshots include the title, canyon, bridge decks, island, moving station, inverted city, dusk skyline, Chase, Cockpit and all five arrivals. The different generator versions place individual buildings and islands at different coordinates. The comparison holds the viewpoint fixed across versions. The shots document an engineering visual review.

## Reproduce the flight measurements

Run `node scripts/benchmark-world-art.mjs <local-preview-url> matrix 4` on Windows with Chrome and D3D11. The matrix tests both quality presets at 1920 × 1080, zero to three companions, and warm and cold starts under 4× CPU throttling. The `soak` suite flies for at least 905 simulated seconds. The `voice` suite adds WebGPU Kokoro to High quality. An optional `SKIMMER_KOKORO_WEIGHTS` path supplies the pinned weights for a warm-cache inference test. The verifier hashes the supplied bytes before placing them in the browser cache.

For warm WebGPU measurements, set `SKIMMER_KOKORO_PROFILE` to a dedicated Chrome test profile. This preserves model and GPU caches across runs. The benchmark completes a voice preview and then requires an audible-provider completion for a new radio reply during the measured flight. One cold attempt and its system fallback are recorded separately.

Frame percentiles come from animation frame intervals during flight. The view-coverage probe projects rays through three city elevations and checks intersected near-field cells. A missing projected cell may be occluded by nearer geometry. Flight buffering, collider coverage, activation latency and resource disposal are measured independently. JavaScript heap samples include garbage collection and omit GPU driver memory.
