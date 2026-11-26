# WorldForge · 层岩回廊

Choose WorldForge in the world panel and enter a seed. The north–south canyon network intersects transverse saddles. Some seeds also open diagonal branches. Airspace width shapes the rock shelves. The terrain height uses absolute coordinates so adjacent 220 m tiles share a boundary.

The kit starts with the original Celadon Court GLB from the City passage system. Its labelled solid, decorative meshes and entry and exit sockets distinguish the bore from the masonry. The offline extractor reads triangles on the labelled near cap and measures radial wall thickness from the authored spring line. It refuses an incomplete section. Generation sweeps and bends the extracted inner and outer curves, closes their portals and extends supports to terrain. Seeds also control island locations, elevation and terracing. Each island and vault belongs to a single tile.

The shared geometry worker builds the full-detail geometry and collision BVH. A bounded distant tile grid uses coarser ground and vault sections. Its meshes have no collision contribution. Near and distant tiles use the same recipe and origin.

From the repository root run the following commands.

```sh
npm ci
npm run worldforge:export -- amber ./forge-export 2
```

Radius 2 exports 25 near tiles. The directory contains the baked GLB, the matching prototype and recipe sources, and a manifest with per-tile fingerprints, triangle count and SHA-256. The comparison includes the same positions, vertex colours and normals as the near renderer. The engine and its existing dependencies are shared overhead.


The connected canyon routes share a cruise altitude of 132 m. Near these routes the generator limits vault height and reserves space above the arches and below suspended islands. The geometry regression sweeps a 6 m radius along the main canyon, transverse saddle and optional oblique branch, including neighboring tiles on both sides of a seam.

For release assembly pass the export directory to `scripts/assemble-dual-release.py --forge-directory` along with the usual distribution, installer, Dragonspine pack and installation evidence arguments. The WorldForge kit includes its prototype, generator sources and comparison manifest. Reproduce the baked reference using the matching Source ZIP and the seed and radius in that manifest.
