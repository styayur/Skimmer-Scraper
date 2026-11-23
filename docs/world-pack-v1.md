# Dragonspine world pack v1

The manifest is UTF-8 JSON. The first schema supports static terrain refinement of the Dragonspine generator. Existing single-file animated GLB worlds use the original world importer.

| Field | Meaning |
| --- | --- |
| schema, generatorVersion | Both are 1 for this format |
| id, packVersion, minimumClient | Pack identity, content version and compatible client version |
| seed, theme, chunkMeters | Unsigned seed, dragon theme and 220 m grid |
| tier | web or high |
| collision | dragonspine-base-1, shared by both render tiers |
| source, license | Authorship and license of the supplied assets |
| files | GLB filename, byte count, SHA-256, integer chunk coordinates and six world-space bounding coordinates per tile |

Each GLB uses local coordinates with the southwest grid origin at (cx × 220, 0, cz × 220). The generator samples a shared collision surface, then adds shallow visual relief. Landmarks, cloud layers, distant terrain and dragons have independent lifetimes. The regular grid applies to terrain.

The client enforces 1 GiB per pack, 8 MiB per tile and 1,024 tiles per manifest. The current desktop library admits 32 installed or staged packs and reserves up to 4 GiB. Installation uses browser-selected files with flat filenames. The native database stages checked chunks under a unique token, then atomically activates the completed pack. The loader verifies each selected chunk's hash again before decoding. The shared world streamer prepares collision first. Near-detail activation retains the previous geometry until the replacement is ready, uses distance hysteresis and allows one decode at a time. Retiring a tile or a world cancels its detail requests.
