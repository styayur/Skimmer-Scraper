# KITE-W and KITE-S

Run Blender in background mode with `--python art/aircraft/build.py`. The script writes the two Blender scenes, material previews and runtime GLBs. Both aircraft are original project assets distributed under AGPL-3.0-only. They use solid colours and procedural meshes.

KITE-W has a roughly 1.9 m pressure suit with folding carbon spars supporting a 5.8 m membrane. KITE-S has a 5.2 m ceramic hull with separate vector nacelles. Both face Blender +Y, which the glTF exporter maps to game −Z. The dorsal side points toward game +Y. In glide the flight controller rotates the complete airframe into the local tangent frame.

Both use the existing 3.2 m swept sphere and score rules. Centred half-span on KITE-W is 2.9 m. KITE-S has a centred half-length of 2.6 m. These figures describe the model axes, not the distance of every vertex to the collision centre. The cockpit uses the bounds-based standard anchor and retains a separate camera override per aircraft ID.

