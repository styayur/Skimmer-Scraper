# Swept manual departure

Standalone source `38f4c3d8c4e1f8e0c5e2049d9bf71c3f19bc7271` passed the original 104729 boost replay, all three public ribbons and two additional controlled boost departures. The production entry SHA-256 is `a6b359d39df41ade94f8a6201698b509ac3e8a6ecf107d7e76e93d5b7a747790`. The parent integrated this source at `946d2f7e8381f9f9af68a0cf7e488ac41debde04`. Exchange owns the independent qualification of that build. [Standalone source](https://github.com/styayur/Skimmer-Scraper/commit/38f4c3d8c4e1f8e0c5e2049d9bf71c3f19bc7271) · [Integration](https://github.com/styayur/Skimmer-Scraper/commit/946d2f7e8381f9f9af68a0cf7e488ac41debde04)

## Previously held-out failure

Seed 104729 failed its original must-succeed classification on integrated `7845d30f`. A fresh synchronized production-browser run reproduced all 65 recorded samples, the input schedule and the impact. The archived stock and failed recordings are the original Exchange Git blobs. The regenerated revision 2 GLB matched SHA-256 `269abb1b4ee7832b0af77d491f3837d55738880831d5628b7e992a11b1472997`. Each run used Chromium 153.0.8010.12, the imported entry pose, three wingmates, boost held from launch and the same LB pulses after four and 48 intervals of 64 ms. [Original independent failure](https://github.com/styayur/Skimmer-Scraper/blob/d616d7e2d50cef6206074892546cd69289ec822d/acceptance/joint-flight/topogenesis/integrated-7845d30f/holdout/ribbon-bridge-104729-boost.json) · [Fixed GLB](../../../../tests/fixtures/ribbon-bridge/ribbon-bridge-104729-boost.glb)

| Observed field | Stock `991138b8` | Original failure `7845d30f` | Standalone `38f4c3d8` |
| --- | ---: | ---: | ---: |
| Longest sampled continuous glide | 231.623 m | 182.904 m | 182.904 m |
| Pre-release losses | 0 | 0 | 0 |
| Speed immediately before LB | 98.992 m/s | 72.495 m/s | 72.495 m/s |
| First DETACHING / FLIGHT physics steps | 369 / 399 | 369 / 399 | 369 / 399 |
| Pitch on return to FLIGHT | +1.039° | −0.918° | +1.770° |
| Minimum sampled solid distance across run | 5.098 m | 3.383 m | 5.235 m |
| Shield impacts | 0 | 1 | 0 |
| Final speed / pre-release speed | 1.022 | 0.954 | 1.303 |

Curvature braking put the pilot at z = 22.34 m when LB arrived. Stock reached z = 71.12 m on the same tick. The last triangle at the slower release pointed partly downstream. The nose was already moving away from its plane while descending in world space. The old one-step outward check accepted that bearing. Neutral pitch then preserved the downward angle as boost accelerated the pilot toward the next rise.

The fixed-step reconstruction matched the original browser positions to within 0.000000000001 m. On step 452, at 3.7667 s, the proposed endpoint was 3.247 m from solid geometry. That entered the 3.26 m shield envelope. The browser first exposed the increment at 3.775 s. The corrected replay matched every browser sample through LB. On step 452 it passed at 5.905 m. Its final speed was 94.449 m/s after the same held boost, compared with 69.186 m/s after the original shield response. [Stock recording](stock-991138b8.json) · [Original failed recording](frozen-7845d30f.json) · [Corrected recording](corrected-38f4c3d.json) · [Fixed-step poses, proposed endpoints and collision fields](fixed-step.json)

## Departure bounds

The departure check runs once on manual LB or Space release with a known contact normal. It predicts the usual handoff and subsequent pilot flight at 120 Hz with the current input and control settings. The horizon in seconds is `min(1.25, 0.25 + entrySpeed / 110)`, about 0.91 s on the historical case. Each predicted displacement must pass the existing coverage and timed swept-body checks, including moving colliders.

If the ordinary departure fails the sweep, the controller tries up to three successively larger outward normal speeds, preserving the tangential bearing. It accounts for the normal component of carrier motion and tests increments of 3.2, 6 and 12 m divided by the horizon on the standard aircraft. It applies the first fully swept option. On the known failed pose, the selected minimum outward speed was 6.096 m/s. Across the 15 public boost positions the first release step issued 87–215 timed chord checks. Step counts and selected speeds are recorded in the fixed-step evidence.

The handoff retains the 110 m/s² velocity-change limit, 3.1 rad/s attitude limit and 0.25 s minimum duration. If every candidate is occupied or lacks coverage, LB still disengages and the ordinary handoff gives control back to the pilot. Actual shield and Challenge checks remain active. The forecast assumes the held input and available world motion over its bounded horizon. Subsequent pilot commands, new obstacles and later free-flight travel are outside that prediction.

## Development and retained fixtures

Every public asset was replayed at boost with releases at intervals 24, 32, 40, 48 and 56. The previous controller struck on 8131 at 40 and 48 and on 95603 at 48. All 15 corrected replays completed without shield or Challenge contact. The pre-release positions, velocities and the two handoff phase steps matched in every pair. These are development variations on the public GLBs.

Two of those failures also reproduced in the production browser on `7845d30f`. After the correction, 8131 at interval 40 held 153.243 m and passed with a minimum sampled solid distance of 4.085 m. Seed 95603 at interval 48 held 183.113 m and passed at 4.625 m minimum. The three original public must-succeed schedules matched their previous qualified browser sample streams exactly. [Paired development browser recordings and original replay comparisons](browser-rechecks.json) · [Original public traces](../ribbon-recheck/README.md)

All 27 original fixed-step measurement rows matched, including translating carriers, oblique folds, chunk seams, mirrored narrow ribbons, partial coverage and open gaps. Four original Chromium 159.0.8154.6 sample streams also matched exactly. Both gallery aircraft held 172.87 m, the helix held 285.10 m and climbed 82.98 m, and the three-sheet gap returned to free flight at 1.017 s. The historical tower and Challenge scoring browser tests passed.

Three additional moving-gate tests exercise manual release with actual indexed geometry. An early crossing permits the ordinary handoff. A low crossing requires a swept outward departure. A tall crossing blocks every option, and the resulting neutral flight registers the obstruction in both collision paths. The full suite passed 331 unit tests with one opt-in benchmark skipped. [Release regression and acceleration checks](../../../../tests/unit/ribbonBridgeGlide.test.ts) · [Moving-gate fixtures](../../../../tests/unit/surfacePatchGraph.test.ts) · [Prior full retained measurements](../ribbon-recheck/retained.json)
