# Sakura Free Flight workload on the official 0.10.0 and 0.11.0 sources

The retained Radeon runs show a longer GPU timer sample for 0.11.0 at comparable points on the route. In a separate hosted replay, both releases submitted the same 26 shader programs. All 52 strictly matched frames had the same draws per program and the same draw command multiset. The patch in PR 98 eliminates 25,920 unused relay eligibility calls across 72 simulated seconds. Physical queries, flight paths and companion behavior matched before and after the change. Its measured CPU footprint is too small to account for either foreground regression. [Hosted comparison](https://github.com/styayur/Skimmer-Scraper/actions/runs/46135669818) · [PR 98](https://github.com/styayur/Skimmer-Scraper/pull/98)

## Radeon measurements

| Foreground route | Stock | Final | Candidate/stock GPU time at matched workload |
| --- | ---: | ---: | ---: |
| Web mean FPS | 109.1893 | 100.5425 | 1.0922 across 293 groups |
| Web p95 frame interval | 16.7 ms | 16.7 ms | |
| Windows mean FPS | 106.6587 | 96.4691 | 1.1154 across 301 groups |
| Windows p95 frame interval | 10.2 ms | 11.8 ms | |

The machine was an AMD Radeon 780M. The Web and Windows comparisons used their own original, full foreground routes with two inversions per run. Stock and final Web observations were separated by 77 min 35 s. The Web renderer main thread used 6.345 and 6.245 ms per delivered frame respectively. Web script used 4.463 and 4.262 ms. On Windows the renderer thread used 6.129 and 6.670 ms, including 4.372 and 4.619 ms of script. GPU frequency, temperature and power were unavailable. The renderer samples asynchronous elapsed-time queries at most every 250 ms. The one-second observations can contain an earlier completed query. [Web group data and source digests](foreground-strata.json) · [Windows group data and source digests](windows-strata.json) · [GPU timer source](https://github.com/styayur/Skimmer-Scraper/blob/ac943acd6a2c6d21431aa138327bc3e64ed8552f/src/render/gpuFrameTimer.ts)

Each group matched seed, draw calls, triangle count, render objects, collision triangles and resident chunk count. A second analysis also required ASCENT, the same world index, three covered wingmates and positions within 5 m. Matching observations without replacement gave 485 Web pairs across 287 groups, GPU ratio 1.0922, and 517 Windows pairs across 297 groups, GPU ratio 1.1133. Median distance was 0.55 m for both. The result is descriptive. This investigation leaves the original release qualification intact. [Recompute from the retained sample archives](foreground.py)

## Shipping graphics

Each clean hosted Web entry matched the SHA-256 digest recorded for that release during the Radeon Web run. Both measurements used the production game, geometry worker, collision BVHs, High quality, procedural aircraft, chase camera, free shielded flight, three wedge-formation wingmates and real Q + Shift keyboard events. The experiment opened the original seed 334458 and reached 479568308 and 501763084 through one and two complete production Sky Inversions, including the palette and profile changes. Opening the derived seeds directly gives a different district. [Archived build manifests, inputs, arrivals and draw traces](raw/graphics.zip) · [Earlier harness run that detected the mismatch](https://github.com/styayur/Skimmer-Scraper/actions/runs/46132068553)

| Shipping Web entry | SHA-256 |
| --- | --- |
| Stock 991138b8 | `91f1a9bcdb190878af05d6b93ebdc16c01fbbb5ffc898d70bf5fdb22e52687c8` |
| Final ac943acd | `176ab1ccad4a48f9aad5a73ca7f99c06d409807db34f5f797c3ad5ccc7a6483a` |

Each version ran twice in A/B/B/A order with a fresh Chromium context per world. Each 12-second circuit delivered 1,440 fixed physics ticks. Worker queues drained between the one-second observation points. The shipping debug bridge set the start pose and advanced the fixed-step loop with normal keyboard input. The browser observer controlled presentation timestamps and recorded the actual GL submissions at 960 × 540 on Chromium 159 SwiftShader. Start and end observations were taken while paused and 12 observations during running flight. These conditions provide deterministic call and scene comparisons. Hardware frame pacing and native WebView composition are measured in the original foreground records. [Replay harness](tools/replay.mjs) · [GL observer](tools/browser-probe.mjs)

All 84 cross-version pairs matched aircraft position, velocity, attitude, camera and all three wingmates. They also matched the active GLSL program set. Across the capture the same 26 vertex/fragment program pairs were linked and used. Each pair identifier hashes both shader stages' exact submitted source. Paired frames qualified for the strict comparison only when resident chunk IDs, revisions, fingerprints, world statistics, object counts, draw counts and rendered triangles also matched. Differences in adaptive worker residency excluded 32 pairs. The unfiltered results are preserved. [Frame-level matching and source hashes](hosted-results.json)

| Strict frame pairs | Count | Equal draw multiset and recorded pipeline sequence | Exact draw order | Order differences confined to shadow-map draws |
| --- | ---: | ---: | ---: | ---: |
| Stock vs final, both orders | 52 | 52 | 43 | 9 |
| Stock vs stock | 26 | 26 | 15 | 11 |
| Final vs final | 24 | 24 | 22 | 2 |

Forty of the 52 matched cross-version pairs were running frames. Across the nine pairs with order differences, 327 command slots exchanged draw arguments within the 1536² directional shadow pass. The ordered programs, draw types, recorded blend/cull/depth flags, masks, viewport and default/offscreen target class still matched. Uniform setter counts by name and setter type matched for all 52. Attribution to uniform values, texture contents, vertex data, driver scheduling, pixel coverage or hardware time per pass requires further measurements. The raw GL draw count exactly matched Three.js for every captured frame. [Per-frame traces and exact GLSL](raw/graphics.zip)

The stock and final Git blobs for Sakura materials, architecture generation, aircraft, petals, mirror sky, atmosphere, camera, audio synthesis and render timer were identical. Three.js 0.187.0, three-mesh-bvh 0.9.18, Vite and Playwright matched in version and package integrity. The renderer changed the mirror-sky eligibility test during construction and world selection. Both predicates are true for Sakura. The High preset, 1536² directional shadow, bloom passes, tone mapping and exposure are present in both sources. [Git blob and package inventory](source-identity.json) · [Renderer in stock](https://github.com/styayur/Skimmer-Scraper/blob/991138b8c67c188bd47731d6c193142750225818/src/render/GameRenderer.ts) · [Renderer in final](https://github.com/styayur/Skimmer-Scraper/blob/ac943acd6a2c6d21431aa138327bc3e64ed8552f/src/render/GameRenderer.ts)

## Physical and CPU work

Counters ran in separate instrumented builds. The graphics lane used the clean release builds. Each column covers two circuits per world, six circuits and 8,640 fixed steps. Durations in the raw captures include wrapper overhead and nested calls.

| Event | Stock | Final | PR 98 |
| --- | ---: | ---: | ---: |
| Relay eligibility checks | 25,920 | 25,920 | 0 |
| Player and companion shield sweeps | 34,560 | 34,560 | 34,560 |
| Static nearest-surface adapter calls | 81,048 | 81,048 | 81,048 |
| Static per-chunk BVH closest-point calls | 16,534 | 16,534 | 16,534 |
| Ordinary companion perception decisions | 1,088 | 1,088 | 1,088 |
| Radio, music and flight audio updates, each | 72 | 72 | 72 |
| Radio announcements | 2 | 2 | 2 |

There were zero semantic candidate searches, mission ticks or re-resolutions, surface-patch plans, journey-memory writes and actual model requests in the measured default flights. Final's eight-second survey guard fired six times and exited on formation behavior. A deliberately requested perception after each circuit verified the probes. Final observed four local targets and called the semantic-candidate adapter twice per request. Stock observed three local targets. Final also entered the imported-flight recorder guard 8,640 times, with zero due checks or samples for this built-in world. Audio durations in this experiment cover the sampled presentation callbacks and synchronous dispatch only. [Raw source-instrumented counts and positive controls](raw/counters.zip)

PR 98 adds a single early return after the existing mission, trust, radio and team updates. With an active relay order or in Challenge, the existing eligibility and rescue checks still run. The new high-trust test verifies zero unsolicited geometry queries in Free Flight and a successful automatic rescue in Challenge. The focused run passed all 73 tests. All 84 paired observations in the patch comparison matched player and wingmate state, impacts, rules, relay resources and missions. On this runner the old eligibility checks occupied a median **0.35 ms per 12 simulated seconds** in the paired patch lane, including instrumentation. Its hardware FPS impact remains unmeasured. [Patch comparison and test results](raw/relay.zip) · [Focused code change](https://github.com/styayur/Skimmer-Scraper/pull/98/files)

## Next measurable costs

For GPU attribution, instrument the original shadow, scene and bloom passes in separate samples using disjoint GPU timers, then compare matched commands in interleaved Radeon A/B/B/A runs with clock, temperature and power readings. In the hosted candidate trace the median captured frame issued 55.5 draws at the 1536² shadow resolution, 414 at scene resolution, 12 at other offscreen resolutions and one to the backbuffer. Those work counts identify where to place probes. The cost of each pass on the Radeon requires a hardware measurement.

For CPU attribution, the existing shield path accounted for 10,256 of the 16,534 static BVH calls, including 8,016 under the three companions. A bounded follow-up can count exact repeated static endpoint queries at the same position, radius, chunk membership and revision before considering reuse. Preserve the existing moving-collider sweeps and verify the complete impact and pose traces. The original qualification results apply. [Shield sweep](https://github.com/styayur/Skimmer-Scraper/blob/ac943acd6a2c6d21431aa138327bc3e64ed8552f/src/game/shield.ts) · [Caller-attributed BVH counts](hosted-results.json)

## Reproduction

The three ZIPs are the original hosted artifact bytes. Their SHA-256 digests match the GitHub Actions artifact metadata. From this directory, Python can regenerate the hosted summary using the standard library. [Archive digests and run identities](raw/artifacts.json) · [Pinned workflow](https://github.com/styayur/Skimmer-Scraper/blob/19f57220b01e8d2d3fb9ab784fd182dc1bcb4b5e/.github/workflows/sakura-cost-evidence.yml)

```sh
python -m zipfile -e raw/graphics.zip extracted/sakura-graphics
python -m zipfile -e raw/counters.zip extracted/sakura-counters
python -m zipfile -e raw/relay.zip extracted/sakura-relay
python analyze.py extracted recomputed.json
```
