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

## Browser support

WebGL2 remains required for rendering. GLTF loading itself uses Three.js `GLTFLoader`; Draco or Meshopt
compressed GLBs are not supported unless their decoders are added explicitly. Keep models self-contained
and avoid external texture paths.
