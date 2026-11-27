# Finite imported flight studies

Download an original [contact deck or Relay District GLB](https://github.com/styayur/V2Wpro/tree/58442fd/examples). Open Worlds with G, select the file, analyze and apply. Keep the current world to replay the exact layout. Start Free Flight and tap LB or Space on approach. Tap again to leave the surface along the current tangent. In Relay District the forward wall leads over a convex edge onto the roof. The other architectural forms are open for exploration.

The world library displays the collision triangle count, transformed dimensions and spawn position. Scene-local WorldIR topology nodes can guide a nearby forward scan or a wingmate's leading corridor. Hints move through the same up-axis, yaw, scale and recentering transform as the GLB. Generated layout variants can move structures independently, so their pilots use live perception. Manual spawn and heading retain priority. A flightEntry version 1 supplies position and toward as finite XYZ triples. The importer checks its level direction and 60 m departure corridor against collision before accepting it.

## Reproduce the flight

Install Python Playwright and Chromium alongside the project's usual Node dependencies. Use Python Pillow for the optional WebP recording. Run the commands from this project. With the production preview running on port 4173, place the GLB alongside the checkout or pass its absolute path.

```sh
npm ci
npm run build
npm run preview -- --port 4173
python scripts/measure-import-flight.py contact.glb contact-report.json
python scripts/measure-import-flight.py district.glb district-report.json --release-tick 74 --orders --film
```

The harness imports through the real UI, keeps and reopens the same SHA-256 and flies with standard Gamepad button 4. The first press follows four 64 ms intervals of ordinary flight. The second press defaults to interval 48. Samples come from the game's normal fixed-step simulation. The harness never sets aircraft pose or velocity. The orders option sends local radio requests. It records rejected approaches as well as accepted assignments. The GPU option runs a separate 120-frame sample on Windows D3D11 with a full Chromium executable. The default software renderer is for functional reproduction.

## Evidence

The baseline release commit is `18e8fbcc931156da5035cb6c694e098b0111982a`. The original Lattice and Canopy GLBs come from V2Wpro v0.2.0. Raw traces, build identities and the captured transfer recording live in [acceptance/joint-flight](../acceptance/joint-flight). The producer independently verifies the GLB hash and computes the sampled glide distance. [Geometry revisions and reproduction commands](https://github.com/styayur/V2Wpro/pull/3).

| Study | Result |
| --- | --- |
| Original Lattice, seed 8131 | Exact save replay and running flight. LB acquisition lost contact over the discrete beams. |
| Original Canopy | Ordinary flight and world switch succeeded. The scripted approach missed capture. |
| First continuous roof, seed 8131 | Surfaced successfully. A shield strike followed departure. |
| Corrected cruise roof, seeds 8131 and 8132 | Reached sustained GLIDING, active detachment and free flight with zero player shield strikes. |
| Cruise roof under boost, seed 8132 | Peak speed 101.85 m/s. One strike after release. |
| Boost-designed roof under boost, seed 8132 | Peak speed 101.64 m/s. Capture and release succeeded with zero player shield strikes. |
| Relay District | Transferred from the wall to the roof and actively detached. A leader and a landmark scout accepted assignments. A near-roof escort approach was rejected as unreachable. After clearing the tower, KITE-2 accepted the retry and entered escort formation. KITE-3 completed inspection and returned. |

The matched 640 × 360 contact-deck samples on AMD Radeon 780M D3D11 gave p95 of 8.4 ms in both builds. One 120-frame sample per build supports a comparison of this scene and viewport only. This experiment covers emulated LB input. The historical physical-controller record belongs to v0.9.2. Continuous traversal of all spiral terraces, serpentine seams, general concave junctions and infinite imported layouts remain experimental.

