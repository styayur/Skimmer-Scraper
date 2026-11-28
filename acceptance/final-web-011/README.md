# Final Web flight repeat

The historical matrix contains 14 development flights, six first holdouts, eight second holdouts and six third holdouts. The third panel became public after its original run. All four panels use their previously published inputs and gates. The separate five-world comparison covers Canopy, Caldera, Lattice, Contact Deck and Relay District at their original entry poses.

## Historical controllers

Each fraction counts flights meeting their assigned disposition. A dash means the panel had no measurements on that controller. The manifest links each observation to the original raw file and records both the controller SHA and the served entry digest. [Per-case history](inputs.json) · [Immutable original evidence](https://github.com/styayur/Skimmer-Scraper/tree/d66b343cdd88d7d499e77afa4a63e8e3594f2813/acceptance/joint-flight/topogenesis)

| Controller | Development | First holdout | Second holdout | Third holdout | Measured total |
| --- | ---: | ---: | ---: | ---: | ---: |
| Stock `991138b8c67c188bd47731d6c193142750225818` | 13/14 | 4/6 | 7/8 | 5/6 | 29/34 |
| Initial integration `0a5272b36352a1300253080bd38cfb5d520c7e0d` | 10/14 | 4/6 | — | — | 14/20 |
| Ridge correction `7845d30fcd428dbff50c5d45ba1c893ee7a3bf3b` | 13/14 | 4/6 | 8/8 | — | 25/28 |
| Swept release `946d2f7e8381f9f9af68a0cf7e488ac41debde04` | 14/14 | 6/6 | 8/8 | 5/6 | 33/34 |

The initial integration missed all four mandatory ribbons. The ridge correction recovered the three development ribbons. On historical holdout 104729 it retained contact through LB and then recorded a shield strike in flight. The swept-release correction recovered that row and missed the public third-panel S-curve 661077278, which lost contact before its release interval. [Original 104729 failure](https://github.com/styayur/Skimmer-Scraper/blob/d66b343cdd88d7d499e77afa4a63e8e3594f2813/acceptance/joint-flight/topogenesis/integrated-7845d30f/holdout/ribbon-bridge-104729-boost.json) · [Original third-panel S-curve](https://github.com/styayur/Skimmer-Scraper/blob/d66b343cdd88d7d499e77afa4a63e8e3594f2813/acceptance/joint-flight/topogenesis/integrated-946d2f7e/third-holdout/s-curve-661077278-cruise.json)

## Inputs and measurement

Each matrix case uses the revision-2 GLB, saved layout, approach, companion count and LB schedule listed in the frozen manifest. Exporting from the v0.4.0 release source reproduced all 34 original GLB sizes and SHA-256 digests. The portable archive also retains the two catalog assets used by the original three auxiliary rows. Historical auxiliary results remain in the manifest. The five shipped-world flights use the parent's original script and its release interval of 48 for every world. [World bytes](inputs.zip) · [Input reproduction](prepare_inputs.py) · [Five-world script](run-legacy-examples.py) · [V2Wpro v0.4.0](https://github.com/styayur/V2Wpro/releases/tag/v0.4.0)

The workflow reads a previously built distribution, checks its GitHub archive digest, HTML module entry, clean source and complete file manifest, then serves it on runner loopback. Each real-game import is saved and reopened. Each case records the browser's actual entry response and verifies the entire schedule against stock, including the first sample and the 16 intervals after release. The environment uses Python 3.14.7, Playwright 1.63.0, headless Chromium 153.0.8010.12, SwiftShader and a 640 × 360 viewport. The simulation runs at 120 Hz with observations every 64 ms and zero animation-frame offset at launch. [Hosted workflow](../../.github/workflows/final-web-flight-evidence.yml) · [Frozen harness](https://github.com/styayur/Skimmer-Scraper/tree/d66b343cdd88d7d499e77afa4a63e8e3594f2813/scripts)

The mandatory gate requires continuous sampled glide through the release pulse, observed detachment, a return to flight, zero shield impacts and no sampled hull intrusion. Difficult routes may also meet the gate through a safe refusal or by returning to free flight before release. An open-air refusal has its own stricter phase check. Glide distances are sampled position chords. Minimum clearance is an observation at the sampling interval. These runs cover the specified inputs on the production Web build. [Original scoring function](https://github.com/styayur/Skimmer-Scraper/blob/d66b343cdd88d7d499e77afa4a63e8e3594f2813/scripts/flight_bench_metrics.py)

## Stock calibration

Both GitHub-hosted stock flights reproduced the previously published trajectories exactly, including every position and sample time. Ribbon 104729 released cleanly. Third-panel S-curve 661077278 lost contact. The initial hosted job failed at the post-flight diagnostic reader because its Ajv dependency was absent. The artifact retained both complete browser reports. The pinned reader subsequently validated those exact files, and the final workflow installs its lockfile. The parent also measured the five shipped worlds on official stock. [Hosted calibration job](https://github.com/styayur/Skimmer-Scraper/actions/runs/46119515899) · [Calibration readback](results/hosted-stock-calibration/measurement.json) · [Parent's five-world stock readback](results/shipped-stock/readback.json)
