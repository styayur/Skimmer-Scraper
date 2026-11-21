# Local GLB aircraft

Skimmer-Scraper imports aircraft entirely in the browser.

## Privacy and storage

- Selecting a `.glb` reads its bytes with the File API.
- The bytes are stored in IndexedDB under `skimmer-scraper-models`; only metadata and the selected model
  ID use `localStorage`.
- Nothing is uploaded. There is no account, server endpoint or analytics payload for aircraft.
- Selecting **移除当前导入** deletes the file from IndexedDB.
- Imported models are user data and must never be committed to this repository.

## Validation

- Maximum file size: 48 MB.
- Maximum triangle count: 250,000.
- GLB version 2 is required.
- The container must contain a JSON chunk with at least one triangle primitive.
- External `uri` references are rejected, including remote images and buffers. Only embedded data URIs
  are accepted so importing cannot trigger hidden network fetches.
- IndexedDB is limited to 24 local models.

## Rendering normalization

The loaded glTF scene is wrapped without replacing its authored materials. The entire scene is centered
and uniformly scaled so its largest dimension is 8 m. Browser-local materials, textures and node
transforms are preserved. A 180° orientation control handles GLBs that use the opposite forward axis.

## First-person anchors

Open Flight Settings → Advanced → Cockpit position to choose Standard, Fighter,
Glider, High, or a custom anchor. Presets use the normalized bounds of the active
aircraft in its current orientation. Enable live preview to see the cockpit view
before saving. Restore recommended selects Standard for the current aircraft.

Custom coordinates are in meters within ±8 m per axis. X points right, Y up and
negative Z forward. Anchors are stored per aircraft alongside the previous XYZ
format. Older saved coordinates load as Custom, and a saved Nose view opens in
Cockpit. The cockpit view hides the aircraft mesh. The collision envelope and
IndexedDB model format stay the same.

## Browser support

WebGL2 remains required for rendering. GLTF loading itself uses Three.js `GLTFLoader`; Draco or Meshopt
compressed GLBs are not supported unless their decoders are added explicitly. Keep models self-contained
and avoid external texture paths.

For optional language models that power companion dialogue, see [Companion radio](RADIO.md).

The aircraft library and local world library are separate. World imports have
separate collision settings, scene validation, decoder support and resources.
[World import](WORLD-IMPORT.md) · [Moving structures](DYNAMIC-WORLD.md)
