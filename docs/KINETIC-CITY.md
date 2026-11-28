# Kinetic City

Choose **Kinetic City** in the World panel, or open `?theme=kinetic-city&seed=334458&gen=4`. The spawn faces a four-way elevated junction. Follow the deck straight, turn onto the cross street or fly freely between the buildings. The seed, world mode and generator round-trip through the existing share link.

## Grid and sockets

`kinetic-grid-1` partitions the horizontal plane into 220 m cells and 4 × 4 regions. Integer coordinates use floor division, including west and north of the origin. Each column has an uninterrupted north–south spine. Each four-row band has one east–west corridor that joins every spine on an open plaza. The sketch below shows the four routes leaving one junction.

```text
                 N(x,z)
                    |
 W(x,z) --------- plaza --------- W(x+1,z)
                    |
                N(x,z+1)
```

The normative hash is the four-word unsigned `hashNumbers` in [deterministic.ts](../src/world/deterministic.ts). For band `b = floor(z/4)`, its junction row is `4*b + H(seed,0x4a,0,b)%4`. At a face use `h = H(seed,axis,x,z)`. The lateral coordinate along the face is `u = 110 + h%25 - 12`. The deck height is `y = 80 + ((h >>> 8)%13)`.

| Face | Axis | Global centre in metres | Forward | Right |
| --- | --- | --- | --- | --- |
| N(x,z) | 0x4e | (220x + u, y, 220z) | +Z | +X |
| W(x,z) | 0x57 | (220x, y, 220z + u) | +X | −Z |

A region at `rx=floor(x/4), rz=floor(z/4)` starts its six-module palette at `H(seed,0x52,rx,rz)%6`. A nonjunction cell selects `(offset + localX + 2*localZ + revision)%6`, in S-curve, helix, sky-arch, bowl, ribbon-bridge, tunnel order. A junction has four arms and a level plaza. Each arm meets the plaza flush along an entire edge. Buildings use the existing district prototypes. Placement rejects lots within 9 m of the plan-view bounds of any individual sweep triangle.

## Module and streaming contract

The production catalog pins V2Wpro boost rules revision 2. The rule profile describes a 102 m/s boost, 44 m/s² lateral acceleration, a 3.2 m hull radius and 6.5 m clearance. Skimmer still evaluates the placed module through its own flight model and BVH.

The fixed MIT catalog contains ordered parameter stations in metres. Skimmer sweeps the primary deck, per-station loft sections and secondary shells. It interpolates the offsets between the two shared centres with `t²(3−2t)`. The helix doubles back in Z. Both ends use the source 32 m flat ring, with a 1.6 m underside. Socket ends are open, and the tunnel shell has solid end rims. [Source and license](../CREDITS.md#kinetic-city-and-dragonspine-canyon-spans)

The worker sends indexed near and distant road meshes, a single shared skyline and an independently sampled collider with its serialized BVH. The distant road uses the source collision stations, switches at 310 m with 10% hysteresis, and retains the socket rings. Each resident chunk draws from shared material and prototype owners. The existing predictive streamer activates collision before adding render objects and caps the combined pilot and companion working set at 41 chunks. Chunk geometry is local to its origin. Semantic positions and boundary addresses stay in simulation metres.

Stable revisits reconstruct the same vertex and index buffers. Ephemeral retirement advances interior revisions through the existing bounded history. Shared socket locations ignore revisions. Sky Inversion releases the outgoing world and enters a newly seeded Kinetic City. Restart restores the original seed.

`WorldStreamer.semanticCandidates(position)` reads nearby active chunks and returns up to 32 authored surface, socket and route candidates within 160 m. Every lease expires with its chunk or world. `routeHint(position,forward)` selects a forward mounted route or socket. Glide contacts on the same connected spine or cross street carry a world-scoped logical surface ID alongside the live geometry ID. Tunnel roofs, buildings and the plaza retain distinct contact identities. Mission and flight controllers perform their own collision and motion qualification.

## Dragonspine

Selecting Dragonspine from the World panel enables `spans=1`. Historical Dragonspine links keep their original terrain and record scope. The new variant has its own score scope and places the same sky-arch profile across the rock banks at `z=1760*row−90` in each canyon. Adjacent chunks clip the fine mesh and coarse collider to their respective boundaries. The crownback, islands, vaults and terrain detail packs retain their existing streaming paths.

## Reproduction

Run `npm test -- tests/unit/kineticCity.test.ts` for the source digest, three-seed proxy and LOD agreement, mixed-revision sockets, visitation order, eviction, leases, floating origin and Dragonspine seam. Run `npm run build` and `npm run test:e2e -- tests/e2e/kinetic-city.spec.ts` for a production Chromium flight, worker contact, world selection and inversion. The test saves a gameplay capture.

Run `node scripts/compare-kinetic-packs.mjs <new-directory>` to write both packages and the comparison. It bakes one contiguous region to 16 GLBs and reads them back. The comparison includes both road LODs, skyline, ground, static collision, logical surface spans and resident hints. It charges the generated package for the entire kinetic catalog, the entire district profile library and the region recipe. Both packages use independently gzipped files at level 9. [Measured package sizes](../acceptance/v0110/kinetic/comparison.json)

The revision-2 sample covers 774,400 m². Its generated inputs use 67,765 bytes gzip. The baked tiles use 1,733,035 bytes gzip with 71,004 near render triangles, 55,284 distant render triangles and 40,052 collision triangles. Across three seeds the largest sampled near/distant render-to-collider distance was 0.0996 m against a 0.16 m tolerance. The test sampled every road and shell vertex and triangle centroid for one instance of each module per seed. [Geometry, identity and eviction measurements](../acceptance/v0110/kinetic/geometry.json)

In the production Chromium replay a 17-BVH outgoing world released every BVH and render child on inversion. The engine captures show the helix and the new stone deck crossing the Dragonspine canyon. [Replay and streaming costs](../acceptance/v0110/kinetic/kinetic-streaming.json) · [Kinetic City](../acceptance/v0110/kinetic/kinetic-helix.jpg) · [Dragonspine](../acceptance/v0110/kinetic/dragonspine-span.jpg)

For a short hardware streaming run, serve the clean production build and run `node scripts/sample-kinetic-flight.mjs <preview-url> <new-report.json> 45`. It verifies the D3D11 renderer, stages a 265 m flyover and requires actual cell crossings. An earlier 132 m run on a Radeon 780M started inside a tower at (4596,132,4436). Over 45 simulated seconds it registered 170 shield impacts and zero cell crossings. That collision-stress case peaked at 36 BVHs and 16,245,168 resident geometry bytes and recorded a 199.9 ms p95 frame time. [Raw collision-stress trace](../acceptance/v0110/kinetic/web-corner-contact.json.gz)

The corrected Radeon 780M flyover on source `19ecfda098a5ee8bd2639ff087c43eb83313bf95` covered 4.206 km with three wingmates. All 18 cell entries already had their collision rings ready on the preceding frame. The 2,707-frame run averaged 59.1 FPS with 13.4/32.8/61.9 ms p50/p95/p99, zero buffering and zero shield impacts. Peak residency was 36 chunks, 36 BVHs, 18,176,232 geometry bytes and 64,997,112 reported JS heap bytes. Navigation to running took 1.695 s. Both Web samples used a fresh 1280 × 720 headless Chromium profile with hardware D3D11. The paired 15-minute foreground Web and native Windows comparison remains an integration gate. [Raw flyover measurements](../acceptance/v0110/kinetic/web-radeon-780m.json)
