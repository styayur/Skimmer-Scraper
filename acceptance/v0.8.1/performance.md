# v0.8.1 candidate performance on Radeon 780M

Windows 11 x64, 1920 × 1080, seed 334458. The Web comparison used headed Chrome 157 and the same 44-second boosted route with three wingmates. The desktop tests ran the installed NSIS application under WebView2 157.0.4341.60. Each JSON report identifies the exact candidate it exercised.

## Web flight

The second series collected CDP CPU profiles in both versions. Visible coverage counts frames with at least one missing projected cell. All eight flights entered 18 new collision cells with all 18 ready on the preceding frame. Collision buffering was zero in all eight runs.

| Route | p95 / p99 ms, v0.8.0 → candidate | Worst ms | Frames with missing coverage | Tile activation p95 ms |
| --- | --- | --- | --- | --- |
| City Balanced | 8.5 / 16.7 → 8.5 / 16.7 | 25.0 → 25.2 | 154 → 0 | 19.1 → 17.5 |
| City High | 8.5 / 16.7 → 8.5 / 16.7 | 25.0 → 25.0 | 148 → 0 | 21.1 → 15.8 |
| Dragonspine Balanced | 8.4 / 8.5 → 8.4 / 8.5 | 67.0 → 58.3 | 152 → 0 | 9.0 → 9.5 |
| Dragonspine High | 8.4 / 8.5 → 8.4 / 8.5 | 25.0 → 24.8 | 154 → 0 | 13.9 → 9.8 |

The earlier worker-only series is in `web-frame-comparison.json`. City generation moved off the render thread, but the first worker build sometimes left cells missing at the edge of the camera view. Prioritizing the visible bounds closed that gap in this route. The profiled city runs had similar frame tails even though activation latency improved. Visible objects, matrix updates and draw submission still consumed significant CPU time. City High peaked at 555 draw calls and candidate GPU time was 6.20 ms at p95. The v0.8.0 build did not expose the GPU timer.

## Optional terrain budgets

The active asset column counts declared GLB payload bytes. The decoded geometry cache has its own 8 MiB cap and at most three entries. Active and cached tiles share a 12-tile limit. Each refinement reads one tile at a time. The I/O budget spaces requests by payload size and allows one request immediately after idle. GPU and decode thresholds defer optional visual work for 1.2 seconds. Under pressure the planner targets up to five visual tiles. Base geometry continues to provide terrain and collision.

| Platform and preset | Normal visual tile limit | Active assets | Read rate | Decode threshold | GPU threshold |
| --- | ---: | ---: | ---: | ---: | ---: |
| Web Balanced | 9 | 8 MiB | 4 MiB/s | 10 ms | 14 ms |
| Web High | 12 | 12 MiB | 8 MiB/s | 12 ms | 17 ms |
| Desktop Balanced | 9 | 24 MiB | 16 MiB/s | 10 ms | 14 ms |
| Desktop High Fidelity | 12 | 40 MiB | 24 MiB/s | 12 ms | 17 ms |

## Speech during flight

With the official Kokoro weights already on disk, the v0.8.0 three-wingmate run reached p99 33.3 ms and worst 166.7 ms. The first scheduling candidate reached 33.3 and 166.5 ms. A 12-second recovery interval reduced p99 to 16.7 ms, with one system-voice reply. At 45 seconds, the installed candidate delivered all three replies, two through the local system voice. It recorded p99 8.5 ms and worst 16.8 ms. The first uncached Kokoro inference still produced an 83.3 ms frame. With system fallback explicitly disabled, the three replies reached p99 25.1 ms and worst 191.6 ms. A cached phrase required zero inference time. These are individual runs with different cache histories.

## Sustained desktop flight

The pre-budget candidate flew Dragonspine with the installed high pack for 905 seconds. It recorded p50 / p95 / p99 of 8.3 / 8.4 / 8.5 ms and a worst frame of 25.1 ms. Nine refined tiles were active at peak, with up to six high-tier tiles. The one-second state samples detected zero buffering. Windows process counters cover part of this flight and WDDM memory samples cover the final portion. Full samples and build identity are in `desktop-soak/`.
