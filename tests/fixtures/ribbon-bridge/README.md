# Ribbon bridge development fixtures

These are the three original revision 2 GLBs from the joint flight benchmark. V2Wpro generated each finite ribbon from its seed. The test imports the complete GLB and verifies its SHA-256 before stepping the stock collision and shield queries. Each row has 932 collision triangles. The fixtures carry the V2Wpro contributors’ MIT notice. [Producer at the frozen revision](https://github.com/styayur/V2Wpro/tree/6522b42c9a020c96712a523e3492d8fc2377340a) · [License](LICENSE.txt)

| Seed | Input | LB release after 64 ms frames | Wingmates in browser |
| ---: | --- | ---: | ---: |
| 8131 | Cruise | 48 | 3 |
| 8132 | Boost held from launch | 48 | 3 |
| 95603 | Cruise | 36 | 2 |

All three rows use the imported entry pose, default controls and LB capture after four frames. To reproduce a GLB, run `node tools/topogenesis.js fixture ribbon-bridge <seed> <cruise-or-boost> 2 <output-stem>` at the linked revision. [Fixed-step regression](../../unit/ribbonBridgeGlide.test.ts)
