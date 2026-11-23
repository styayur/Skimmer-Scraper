# Sakura district

The eight linked towers occupy a 220 m square plaza. The moon gate spans a northbound flight corridor. Sky bridges meet its west pier and upper lintel at different elevations. A rotating orbital station occupies the approach, with a suspended orchard above the western roofs.

From the repository root, run `blender -b --python-exit-code 1 -P art/district/build.py` with Blender 5.2.4. The script builds editable linked meshes, assigns thirteen materials, keys the station rotation and writes the blend, GLB, loft profiles and four Cycles review images. Blender uses Z up and metres. glTF uses Y up. The district GLB is an importable reference scene. Start a Vite development server, then run `node scripts/capture-district.mjs <local-url>` on Windows with Chrome and a hardware D3D11 adapter to check the arch, imported animation metadata and flight views.

Select one of the three `span` objects and open its Geometry Nodes modifier. The shared `Viaduct span in metres` group exposes length, deck width and arch rise. The three decks use nominal lengths of 49, 67 and 74 m. End caps and railings extend beyond the deck dimensions. Export evaluates each modifier before triangulation.

Original project-authored meshes, code, materials and renders are distributed under AGPL-3.0-only. No external asset files are used.

