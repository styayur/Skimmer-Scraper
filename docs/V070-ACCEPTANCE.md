# v0.7.0 hardware and flight acceptance

The measurements use the clean v0.7.0-rc.1 build at `79c1c58919f2c9467251e7f831ef28ba356e8316`. Chrome 157.0.8103.79 used the AMD Radeon 780M D3D11 renderer at 1920 × 1080. The baseline used the v0.6.0 tag on the same machine. Tests used seed 334458 and the ordinary fixed-step flight loop.

| Wingmates | Balanced FPS | p50 / p95 / p99 ms | High FPS | p50 / p95 / p99 ms |
| --- | ---: | --- | ---: | --- |
| 0 | 113.6 | 8.3 / 16.5 / 16.7 | 114.1 | 8.3 / 9.0 / 16.8 |
| 1 | 114.9 | 8.3 / 8.5 / 16.8 | 116.8 | 8.3 / 8.5 / 16.7 |
| 2 | 114.6 | 8.3 / 8.5 / 16.7 | 112.1 | 8.3 / 16.6 / 16.8 |
| 3 | 107.8 | 8.3 / 16.7 / 16.8 | 115.3 | 8.3 / 8.5 / 16.7 |

Each matrix run covered at least 44 seconds of simulation. With three wingmates, Balanced at native CPU speed averaged 107.8 FPS against 116.9 on v0.6.0. High averaged 115.3 against 113.3. The projected coverage gap on native Balanced increased from 3.0% to 7.8% of sampled frames. Under 4× CPU throttling, the warm Balanced route averaged 45.3 FPS against 29.2, with p95 frame times of 50.0 and 108.4 ms respectively. The projected gap fell from 12.0% to 5.4%. Each short candidate flight had collision coverage at the sampled boundary crossings. The camera projection includes potentially occluded cells.

## Sustained flight and speech

The three-wingmate Balanced flight took 1,010.6 real seconds and covered 144.4 km at 102.8 FPS. Frame times were 8.4 / 16.7 / 16.9 ms at p50 / p95 / p99. The route entered 466 cells, of which 434 were active on the preceding frame. Flight buffered 31 times for 4.8 s in total. At least one projected cell was missing on 1,325 of 26,569 eligible frames.

The distance accumulates successive world-space positions, including repositioning during inversion. The system voice completed 83 lines during this flight.

The sampled renderer reported 52–672 draw calls, 11,792–553,288 triangles, 23–503 geometries and 19–25 textures. The JavaScript heap varied between 33.8 and 224.4 MiB. End-of-flight p95 generation and activation latency were 17.3 and 18.6 ms. End-of-flight BVHs numbered 32 static and 8 dynamic. These are samples, and heap figures exclude driver allocations.

The system voice completed native speech in the core browser suite. Under High quality with three wingmates, WebGPU Kokoro generated 2 and completed 2 utterance(s) using the verified model in CacheStorage. The flight averaged 113.3 FPS. Inference overlapped 92 frames and its longest observed frame was 175.1 ms. Model loading took 2,562.2 ms.

The completion count includes an in-game voice preview and one radio reply during the measured flight. A separate first radio request without the preview exceeded the application's inference deadline and fell back to Microsoft Kangkang speech. The sampler observed 1,786 inference frames in that attempt. Both records are retained in the hardware folder.

A second warm candidate run peaked at 116.7 ms during inference. Under the same settings and Chrome profile, v0.6.0 averaged 114.3 FPS with a longest inference frame of 208.3 ms. Both versions showed an observable inference hitch despite similar overall frame percentiles.

## Geometry and world transitions

In the streamed moon gate the nearest side was 5.72 m from the measured center. The centered passage caused zero impacts and the offset approach hit the side pier. Three deployed companions retained coverage. All five world crossings released their old static BVHs, dynamic BVHs and scene children. The fifth sky unlocked its signature.

Four tagged v0.6.0 collision buffers cover generators 2 and 3. The 14 paired camera captures cover the title, skyline, flight views, buildings, inverted courts and all five arrivals. The visual assessment is the developer's inspection of the rendered views.

[Raw hardware measurements](../acceptance/v0.7/gpu) · [Browser checks](../acceptance/v0.7/candidate-browser.json) · [Matched views](../evidence/v0.7/visual-comparison.jpg) · [Editable district and reconstruction](WORLD-ART.md)
