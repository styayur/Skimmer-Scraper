# WorldForge · 层岩回廊

Choose WorldForge in the world panel and enter a seed. The north–south canyon network intersects transverse saddles. Some seeds also open diagonal branches. Airspace width shapes the rock shelves. The terrain height uses absolute coordinates so adjacent 220 m tiles share a boundary.

The kit starts with the original Celadon Court GLB from the City passage system. Its labelled solid, decorative meshes and entry and exit sockets distinguish the bore from the masonry. The offline extractor reads triangles on the labelled near cap and measures radial wall thickness from the authored spring line. It refuses an incomplete section. Generation sweeps and bends the extracted inner and outer curves, closes their portals and extends supports to terrain. Seeds also control island locations, elevation and terracing. Each island and vault belongs to a single tile.

The shared geometry worker builds the full-detail geometry and collision BVH. A bounded distant tile grid uses coarser ground and vault sections. Its meshes have no collision contribution. Near and distant tiles use the same recipe and origin.

From the repository root run the following commands.

```sh
npm ci
python art/world-modules/build_celadon_gate.py
python art/world-modules/extract_forge.py
node scripts/export-worldforge.mjs amber ./forge-export 2
```

Radius 2 exports 25 near tiles. The directory contains the baked GLB, the matching prototype and recipe sources, and a manifest with per-tile fingerprints, triangle count and SHA-256. The comparison includes the same positions, vertex colours and normals as the near renderer. The engine and its existing dependencies are shared overhead.

