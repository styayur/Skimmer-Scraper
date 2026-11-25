# Authored passage modules

A static GLB can define reusable flight geometry using two empty nodes with
glTF extras of {"skimmerSocket":"entry"} and {"skimmerSocket":"exit"}.
The sockets mark floor level along the centre line, facing north and 12–55 m
apart. The analyzer uses the same semantic roles as the GLB world importer.
It extracts collision from authored triangles and checks a 10 m wide,
9 m tall clearance volume with a BVH. Each source asset has an ID and
a SHA-256 digest. These inputs fit the project's original architecture
assets and can be exported from Blender or another glTF authoring tool.

The first grammar selects a lane, elevation and modules from the seed,
grammar version and chunk coordinates. It packs modules within the
220 m chunk footprint. The output includes instanced render geometry,
separate collision geometry and the traversable volumes. Geometry and
materials are shared between copies. The recipe manifest records the sorted
asset hashes, seed and grammar version. Serialize it alongside the source
assets to reproduce the assembled modules.

Export a recipe using the existing Node toolchain:

    node scripts/export-passage-recipe.mjs recipe.json 334458 gate-a.glb gate-b.glb

Use the module ID as the GLB filename. The exporter checks source GLB data and
writes a new manifest with the content hashes. Its Node-based loader supports
static modules with untextured materials.

The passage system currently runs through its offline exporter and tests. To integrate
it into a flight world, supply authored passage modules, select suitable
terrain anchors, and register chunk-local collision with WorldStreamer.
LOD and retirement should use the existing streamer and detail budgets.
A meaningful comparison should fly the same seed and route in both modes
and record uploaded geometry, bytes read, collision continuity, frame-time
percentiles and peak memory. The current test covers transform integrity,
determinism and authored collision clearance.
