# Surface Instinct

LB or Space opens a two-second window measured by the 120 Hz simulation. Press again to cancel capture, abort a turn or leave a surface. Pausing freezes the simulation. Focus loss, restart and world inversion clear assistance. Motion changes enter the Assisted score class.

Every eighth tick the planner can search ahead and to the sides. A newly obstructed near-field chord can trigger an earlier search. For a parallel pass, two smooth velocity transitions approach the wall and remove inward speed at six metres. During a head-on approach, an estimated time to stand-off below 0.55 seconds permits a stronger turn and three terminal speed fractions (1.00, 0.72, 0.48). A locked path can finish after the original deadline. ESCAPE verifies the turn and 0.28 seconds of clear run-out. Recovery blends back to the flight model and retains the original capture deadline.

Three forward samples at 0.10, 0.24 and 0.42 seconds estimate the radius of the offset path from its chord and normal change. The curvature budget uses 65% of the 230 m/s² total following limit. The controller brakes at up to 90 m/s² and checks each executed step against the actual geometry. Contact loss can enter REACQUIRE for up to 0.36 seconds or six metres of drift. Each step requires loaded collision coverage and a clear sweep.

The parameter scan replays 18 wall approaches for each acceleration cap. At 560 m/s² the experiment avoided 16 impacts, including one open-air escape. Raising the cap to 680 changed that escape into a capture while increasing peak acceleration. The default uses 260 for ordinary capture and 560 for emergencies. The fixture sweep overrides the cap across both paths. See the [sweep](../acceptance/v092/surface-sweep.json) and [finite geometry runs](../acceptance/v092/geometry.json).

At 48 and 76 m/s, the aircraft followed an 18 m radius cylinder for three seconds, covering 169 and 174 m with at least 6.0 m centre clearance to rounding. The follower projects the lookahead chord's normal displacement to the next physics tick and limits the combined velocity change to 230 m/s². Entering the same curve at 102 m/s exceeded the available turn budget. The aircraft released after 25 m and recovered without impact. In the separate [late-trigger comparison](../acceptance/v092/late-triggers.json), the shipping controller avoided 9 of 15 impacts against 4 of 15 with the 260 m/s² cap.

## Physical bumper check

The [physical XInput trace](../acceptance/v092/physical-pad.json) records button 4 initiating a redirect, capture and a subsequent release in Edge on Windows. Its build identity is embedded in the receipt.

Launch in Free Flight, press LB near a wall, and release after a climb. In open air tap twice to cancel, then hold LB through the window to check it expires only once. Pause mid-window and resume, remap the button and repeat. Check boost and push-to-talk bindings separately. Record the controller model, mapping, platform and whether a person operated it.

## Historical Surface Glide 2.0 baseline

Press **Space** or **LB** while flying toward a wall. Arm early enough to leave room for a turn. With neutral controls the aircraft climbs a vertical face. Bank or yaw during the approach to choose a side. On contact, bank and yaw steer along the surface, pitch adjusts clearance, and boost changes target speed. Press the same control again to launch. A wall with a clear, connected roof can support a continuous climb, corner transfer and rooftop run.

The controller setting −1 selects LB automatically. Standard pads use button 4. The unlabelled 2563:0526 mapping reports its left bumper at raw button 6. An explicit button overrides detection. Overlapping menu, push-to-talk and boost bindings take precedence.

## What happens during flight

| Phase | Aircraft behavior |
| --- | --- |
| FLIGHT | Ordinary flight controls apply. |
| ARMED | Ordinary flight continues while the planner looks ahead at 15 Hz. A second press disarms. |
| REDIRECT | The aircraft follows a short, swept turn. A second press releases it with its current velocity. |
| ATTACHING | The controller aligns the aircraft to the face and settles toward 6 m clearance. A tangential approach within 11 m can enter here directly. |
| GLIDING | The aircraft steers in the surface frame. Connected triangles and chunk seams can carry a run across geometry IDs. |
| TRANSFER | The aircraft brakes before a verified convex edge, rolls around it and continues over the adjacent face. |
| DETACHING | Velocity and attitude blend into free flight for at least 0.25 s. A neutral launch from a vertical climb tips toward clear air when the ordinary pitch limit would steer into the face. |
| RECOVERY | Lost support or an invalidated path releases the aircraft. Arm again after free flight resumes. |

A turn that starts too late can still end in a Challenge impact or a Free Flight shield bounce. Pressing the control during release cannot restart capture mid-transition. The camera keeps its selected view.

## Prediction and clearance

The simulation runs at 120 Hz. Search distance grows with turning radius `speed² / acceleration`, braking distance, one planning interval, the 3.2 m collision radius and target clearance. The forward search checks actual finite mesh faces. The planner ranks projected input, incoming momentum, world up and alternate tangent directions, then takes the first candidate with verified support and clearance. Equal scores retain construction order. Imported worlds normalize their up axis at load. During Sky Inversion the journey controller owns flight until the new world is ready.

Each trajectory leg interpolates relative velocity using `3u² − 2u³` and integrates the result analytically. Acceleration reaches zero at either end of a leg. A manoeuvre must fit the selected acceleration limit. Its centreline is subdivided into chords of at most 3.2 m for the initial clearance check. Each chord is enclosed by a sphere covering the aircraft envelope, half the chord length, 0.12 m margin and the maximum curve deviation `a × Δt² / 8`. The covered chunk range and collision BVHs must clear this whole volume. The conservative envelope can reject a tight but physically possible turn.

Prediction uses surface-relative velocity and adds the surface velocity back to flight. Translating meshes are queried in their moving frame. For rotation or changing scale, the clearance query inflates the current geometry by the measured maximum vertex travel over the prediction interval. A changing animation can invalidate a forecast. Each execution tick rechecks destination support and near-field clearance. The existing shield or Challenge sweep resolves the actual step after the world advances its colliders.

Stable flight retains the 110 m/s² normal and 55 m/s² tangential speed corrections. Quaternion aiming is limited to 4.2 rad/s. Coplanar seams use contact displacement and normal continuity. For a convex transfer, probes on both sides must resolve the two incident faces at the edge, and the entire braking, turning and rooftop path must clear collision. Complex concave corners and unsupported edges can end a glide. Decorative meshes, the sky mirror and the animated dragon provide no glide support.

Further work on continuous turns through complex concave geometry tracks swept-clearance fixtures for intersecting and non-manifold faces. [Issue #76](https://github.com/styayur/Skimmer-Scraper/issues/76)

## Scores

The first applied redirect tick locks the run to **Surface Glide Assisted**, even if the pilot cancels before attachment or the shield absorbs an impact on that tick. Direct attachment also locks the category. Arming and disarming in open air leaves the run in its starting category. The latch lasts until the next run and uses the existing local score keys for historical unassisted and assisted bests.

## Reproducing the physics sweep

```powershell
$env:SKIMMER_GLIDE_SWEEP_REPORT = 'acceptance/v091/surface-glide-sweep.json'
npx vitest run tests/unit/surfaceTrajectory.test.ts --maxWorkers=1
Remove-Item Env:SKIMMER_GLIDE_SWEEP_REPORT
```

The test flies against a finite 12 cm wall at starting speeds of 48, 76 and 102 m/s, with approach angles of 0 and 0.35 rad and arming distances of 14, 40 and 76 m. Each acceleration cap gets the same 18 cases. Rejected approaches continue through the ordinary collision oracle.

| Acceleration cap (m/s²) | Captures / 18 | Rejected | Peak applied acceleration (m/s²) | Longest redirect (s) | Lowest speed / starting speed |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 180 | 9 | 9 | 169.25 | 1.49 | 0.679 |
| **260** | **12** | **6** | **247.13** | **1.37** | **0.664** |
| 320 | 13 | 5 | 305.22 | 1.07 | 0.632 |

The 260 m/s² setting captured three more approaches than 180. Raising the cap to 320 rescued one more while increasing the observed peak by 58 m/s². All successful wall approaches maintained at least 6.00 m centre-to-face clearance to rounding. The suite reports clearance error, peak quaternion rate, time, speed retention, swept-query count and harness runtime. The latter includes test assertions and a separate collision oracle. The frame-rate replay compares identical final flight states at 20, 60 and 144 render frames/s.

Additional finite-mesh fixtures exercise wall-to-roof transfer, wall launch, changing normals, seams, gaps, late arming, concave corners, blocked escape routes, swept moving obstacles, moving targets and unloaded support. The existing glide suite covers ground, ceiling and inclined attachment.

The optional report path saves the sweep and planner timings as JSON. The Vitest harness reads a monotonic clock immediately before and after each real `planRedirect` invocation, including candidate validation and BVH queries. No clock reads enter the flight modules. The p95 is the nearest-rank percentile across all calls, including early rejections.

| Acceleration cap (m/s²) | Calls | Accepted plans | Total (ms) | Mean (µs) | p95 (µs) | Maximum (µs) |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 180 | 77 | 9 | 7.985 | 103.70 | 341.90 | 2854.90 |
| 260 | 75 | 12 | 2.061 | 27.48 | 121.70 | 160.20 |
| 320 | 83 | 13 | 2.108 | 25.40 | 113.70 | 320.30 |

These elapsed times come from one single-worker run on the finite-wall fixture. The groups execute in ascending order in the same Node process, so the first group includes cold execution. Scheduler load, JIT compilation and geometry complexity affect the timings. Machine and runtime details are in the [sweep report](../acceptance/v091/surface-glide-sweep.json).

## Reproducing the gameplay trace

Run against an up-to-date web build from the repository root.

```powershell
npx playwright test tests/e2e/surface-glide-tower.spec.ts --workers=1 --output=acceptance/v091/surface-glide-browser
```

The scenario imports a generated local GLB through the world library, sets a manual head-on spawn, and verifies the tower face against the active collision geometry. Playwright presses Space to arm and again to launch. The browser clock advances in 32 ms increments while the normal render loop drives the 120 Hz simulation. Assertions cover redirect-time score classification, upward velocity, clearance, momentum at release, camera selection and zero shield impacts through free flight.

The per-test output folder contains `wall-climb.png` and `surface-glide-trace.json`. The JSON includes the fixture manifest, verified face, simulated times, phases, position, velocity, attitude, clearance, camera mode, assisted status and impact count. The scenario attaches both files to the Playwright report.

In the recorded Chromium run, the first sampled redirect at 0.70 s had already locked Assisted. At release the aircraft was climbing at 65.77 m/s, 6.00 m from the wall. It returned to free flight at 86.16 m altitude with zero shield impacts. The screenshot shows the chase view immediately before release. [Screenshot](../acceptance/v091/surface-glide-tower/wall-climb.png) · [State trace](../acceptance/v091/surface-glide-tower/surface-glide-trace.json) · [Build, hashes and run provenance](../acceptance/v091/surface-glide-tower/provenance.json)

