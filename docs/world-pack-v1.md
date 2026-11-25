# Dragonspine world packs

The manifest is UTF-8 JSON. Schema 2 refines the terrain of Dragonspine. Schema 1 belongs to the original v0.8.2 map and existing installations remain available for rollback. Existing single-file animated GLB worlds use the original world importer.

| Field | Meaning |
| --- | --- |
| schema, generatorVersion | Both are 2 for current packs |
| id, packVersion, minimumClient | Pack identity, content version and compatible client version |
| seed, theme, chunkMeters | Unsigned seed, the historical ascendant wire identifier and a 220 m grid |
| tier | web or high |
| collision | dragonspine-ascendant-2, shared by both render tiers |
| source, license | Authorship and license of the supplied assets |
| files | GLB filename, byte count, SHA-256, integer chunk coordinates and six world-space bounding coordinates per tile |

Each GLB uses local coordinates with the southwest grid origin at (cx × 220, 0, cz × 220). The generator samples a shared collision surface, then adds shallow visual relief. Landmarks, cloud layers, distant terrain and dragons have independent lifetimes. The regular grid applies to terrain.

The client enforces 1 GiB per pack, 8 MiB per tile and 1,024 tiles per manifest. The current desktop library admits 32 installed or staged packs and reserves up to 4 GiB. Installation uses browser-selected files with flat filenames. The native database stages checked chunks under a unique token, then atomically activates the completed pack. The loader verifies each selected chunk's hash again before decoding. The shared world streamer prepares collision first. Near-detail activation retains the previous geometry until the replacement is ready, uses distance hysteresis and allows one decode at a time. Retiring a tile or a world cancels its detail requests.

Schema 2 manifests include an inclusive maximumClient, a baseWorld dependency and unpackedBytes. The original 2.0.0 content capped at v0.8.2 uses the same collision generator in the unified world and remains compatible. The generator identity, seed and tier must all match.
