# Ribbon-bridge regression and freeze

The unchanged LB schedule now produces continuous capture, deliberate detachment and zero shield impacts on all three frozen development GLBs. The clean standalone controller is `34e62ffc603d8db0d898cb16a24ea1ffdb75d175`, with browser entry SHA-256 `68e0359144bce8225f3cb6065ae9c0f572142a84d0e9c120a39ab764d0e73556`. Exchange owns independent qualification on the integrated client. [Controller](https://github.com/styayur/Skimmer-Scraper/commit/34e62ffc603d8db0d898cb16a24ea1ffdb75d175) · [Integration handoff](https://github.com/styayur/Skimmer-Scraper/pull/92#issuecomment-7234918708)

## First divergent contact

The 120 Hz replay imports each original GLB, uses its actual spawn and BVH, steps the flight controller, advances world motion and resolves the shield. All three stock and regressed paths attached on physics step 31 and reached steady glide on step 84. Against recordings from the production browser, the maximum position difference at matching physics ticks across all six paths was below 0.000000000001 m. Steps below are one-based. The first new velocity correction occurred at steps 135, 111 and 135 respectively, as the two planners began using different curvature samples.

| Development row | First differing contact point¹ | First differing support triangle | First false REACQUIRE | Live centre distance | Forward footprint offset, high probe → near-deck probe |
| --- | ---: | ---: | ---: | ---: | ---: |
| 8131 cruise | 137 | 201 | 207 | 5.52 m | 0.956 → <0.001 m |
| 8132 boost | 113 | 147 | 255 | 6.43 m | 1.450 → 0.059 m |
| 95603 cruise | 137 | 200 | 199 | 5.82 m | 0.810 → <0.001 m |

¹ Position tolerance 0.0000001 m. The regressed controller abandoned support in the 95603 case while both flights still selected the same live triangle. The differing triangle on the next step was a consequence of the diverging paths.

Each failed plan queried ahead at cruising height. At an interior ridge, the exact nearest point could lie on a triangle edge and leave a large residual in that face’s tangent plane. Interpreting that residual as the end of the surface suppressed all outgoing graph edges. On 8132 the subsequent release path triggered the shield on physics step 428. Replaying that case in Chromium against the original integrated entry `e5993c151442ba79878303908d507e016ea05a1908895891f1bab943583c15b9` reproduced the recorded per-sample trace and impact.

When the high probe has an off-face residual above the existing 0.10 m edge tolerance, the planner now uses its existing near-deck query to examine the footprint. The proposed edge must pass the finite-face, motion, progress, coverage and timed swept-clearance checks. At each of the three original rejected poses this query found a neighbouring supporting triangle and verified five stations. The regression test checks every physics tick through release and the following 16 input frames with both Challenge and shield collision detection. On the pre-fix controller it fails at exactly the three REACQUIRE ticks above. [Both probes and guidance from the identical rejected poses](first-contact.json) · [Permanent regression](../../../../tests/unit/ribbonBridgeGlide.test.ts)

## Controlled browser results

Chromium 153.0.8010.12 loaded, saved and reopened each GLB through the production world library. Both LB edges came from the emulated standard gamepad. Capture followed four 64 ms intervals, and release followed 48, 48 and 36 intervals respectively. GLB SHA-256, entry pose, variant, approach, wingmate count, frame alignment and input schedule matched stock and the regressed integration. Distances below are sampled chords over the longest continuous GLIDING interval.

| Row | Stock glide | Regressed glide and outcome | Corrected glide | Minimum corrected solid distance | Corrected losses / shield impacts |
| --- | ---: | --- | ---: | ---: | ---: |
| 8131 cruise | 168.26 m | 70.29 m, contact lost | 156.71 m | 4.74 m | 0 / 0 |
| 8132 boost | 219.76 m | 125.67 m, shield impact | 181.77 m | 5.23 m | 0 / 0 |
| 95603 cruise | 116.91 m | 66.40 m, contact lost | 109.88 m | 5.36 m | 0 / 0 |

All three corrected rows met their frozen must-succeed disposition, detached on LB and returned to free flight. The curvature-limited controller covered less distance before the scheduled release than stock on these assets. The recorded fields include the served binary, input schedule, resource identities, control outcome, positions, velocity, phase, clearance, shield and companion counts. [8131 trace](ribbon-bridge-8131-cruise.json) · [8132 trace](ribbon-bridge-8132-boost.json) · [95603 trace](ribbon-bridge-95603-cruise.json) · [Stock traces](https://github.com/styayur/Skimmer-Scraper/tree/85f34fc1034477138556597ff2279cd0d83f27f1/acceptance/joint-flight/topogenesis/development) · [Regressed traces](https://github.com/styayur/Skimmer-Scraper/tree/85f34fc1034477138556597ff2279cd0d83f27f1/acceptance/joint-flight/topogenesis/integrated-0a5272b3/development)

## Original geometry and collision gates

The four original controlled browser flights used Chromium 159.0.8154.6, the same imported GLB bytes, aircraft, spawn and input ticks as the original A/B exercise. The fixed-step recheck used all 27 original matrix rows. [Revised browser traces and fixed-step measurements](retained.json) · [Original qualification and run commands](../README.md)

| Gate | Corrected observation |
| --- | --- |
| Overlapping curved gallery | KITE-S and procedural aircraft each held 172.87 m, with 4.60 m minimum sampled centre clearance and zero impacts. |
| Helical ribbon | KITE-W held 285.10 m, climbed 82.98 m through 7.57 radians and detached under pilot input. |
| Three-sheet lip and gap | The pilot reached free flight at 1.017 s with zero impacts. The 48, 76 and 102 m/s deterministic runs also released clear. |
| Narrow coplanar ribbons | Both mirrored bends held 82.93 m. Minimum swept centre clearance exceeded 5.72 m in each direction. |
| Translating support and crossings | Carrier and clear crossing each held 107.67 m with zero collisions. The deliberately occupied crossing entered recovery at 0.542 s. Its neutral free-flight handoff reached the obstacle at 0.642 s, registering both collision paths. |

Challenge scoring and head-on tower capture also passed in the production browser. The full unit suite passed 324 tests with the opt-in companion benchmark skipped.
