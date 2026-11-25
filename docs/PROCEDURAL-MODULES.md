# Authored passage modules

A static GLB can define reusable flight geometry using two empty nodes with
glTF extras of {"skimmerSocket":"entry"} and {"skimmerSocket":"exit"}.
The sockets mark floor level along the centre line, facing north and 12–55 m
apart. The analyzer uses the same semantic roles as the GLB world importer.
It extracts collision from authored triangles and checks a 10 m wide,
9 m tall clearance volume with a BVH. Each source asset has an ID and
a SHA-256 digest. These inputs fit the project's original architecture
assets and can be exported from Blender or another glTF authoring tool.

The first grammar selects a single gate, paired gates or a three-part
arcade using the seed, grammar version and chunk coordinates. It aligns
the sockets along an open flight corridor and fits the authored geometry
within the 220 m chunk footprint. The output includes instanced render
geometry, separate collision geometry and the corridor's clearance volume. Geometry and
materials are shared between copies. The recipe manifest records the sorted
asset hashes, seed and grammar version. Serialize it alongside the source
assets to reproduce the assembled modules.

Export a recipe using the existing Node toolchain:

    node scripts/export-passage-recipe.mjs recipe.json 334458 gate-a.glb gate-b.glb

Use the module ID as the GLB filename. The exporter checks source GLB data and
writes a new manifest with the content hashes. Its Node-based loader supports
static modules with untextured materials.

## City flight

Enable **城市生成式空中通道（实验）** in the World menu, or add `passages=1` to a
generation-4 City link. The option has its own record category and follows the
pilot through Sky Inversion. The ordinary city and Dragonspine keep their
existing worlds, and user GLBs stay in the local library.

The streamer loads one SHA-256-verified Celadon Court module for the world.
Every second city chunk on each axis can host a gate arrangement. The lowest
solid geometry clears both local static geometry and the moving structures'
maximum height by at least 16 m. Arrangements that reach within 30 m of the
Sky Inversion threshold are skipped. Existing chunk coverage schedules the
work. The authoritative chunk BVH includes the generated walls and arch
without filling the opening. Three.js uses instanced batches, removes
decorative trim beyond 360 m and hides the passage beyond 850 m, with
hysteresis at both distances. Render detail changes leave collision in place
until the chunk retires. Retirement frees its instance buffers and BVH
geometry. Shared geometry and materials live until the world closes.
If the built-in module cannot be loaded or verified, the city remains flyable
with its base geometry.

## Package comparison

Run `node scripts/compare-passage-packs.mjs <new-output-directory>` from the repo
root to compare 16 fixed chunks using seed 334458. The command exports and
reloads two baked GLBs containing the same 17,408 detailed render triangles
and 6,800 collision triangles. The shared authoring source and recipe total
19,843 bytes raw or 3,486 bytes when individually gzipped. The expanded GLBs
total 899,288 bytes raw or 118,643 bytes when individually gzipped. The report
records inputs, output hashes and exactly which chunk coordinates were used.

This comparison covers the passage layer and flat, baked GLB geometry.
The v0.8.2 full high-fidelity pack contains Dragonspine terrain, materials
and different coverage. A whole-world comparison needs two equivalent
implementations of that content and a fixed real-GPU flight route. The
Chromium smoke covers traversal, side-wall collision, retirement, and
deterministic reload. It does not establish peak memory or frame-time
percentiles for the optional city mode on a physical GPU.
