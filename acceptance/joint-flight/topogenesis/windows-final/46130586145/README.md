# Installed Switchyard repeat after PR #97

**All four active releases passed on public-main `ac943acd6a2c6d21431aa138327bc3e64ed8552f`.** The hosted Windows run finished at 09:34:08 UTC on 2026-11-28. It used the installer from official build 46129495362. The dispatch changed only the package identity in `request.json`. The earlier workflow, gamepad schedule and acceptance checks ran unchanged. [Official Windows build](https://github.com/styayur/Skimmer-Scraper/actions/runs/46129495362) · [Hosted repeat](https://github.com/styayur/Skimmer-Scraper/actions/runs/46130586145) · [Full raw ZIP](raw.zip)

| Opening | First glide | Second glide | Active releases | Shield strikes | Matched flight samples against `c4bc8eac` |
| --- | ---: | ---: | ---: | ---: | ---: |
| Fresh catalog import | 40.647 m | 75.431 m | 2 | 0 | 133/133 |
| Reopened exported layout | 40.647 m | 75.431 m | 2 | 0 | 133/133 |

The standard virtual gamepad sent the same four LB pulses on each opening. The active releases occurred from GLIDING at 1.275 s and 3.392 s, entered DETACHING at 1.308 s and 3.417 s, and returned to FLIGHT at 1.533 s and 3.675 s. All 266 sampled times, positions, velocities, phases, LB states and shield counters matched the corresponding earlier flight. The maximum paired position and velocity errors were zero. [Measured comparison](comparison-to-c4bc8eac.json) · [Fresh input trace](fresh-lb.json) · [Reopened input trace](reopened-lb.json) · [Earlier raw ZIP](../46121936254/raw.zip)

The catalog recorded zero external requests before confirmation and one confirmed GET across both openings. The local library reopened variant 0 with the same authored spawn and 6,100 collision triangles from the exported layout. The official V2Wpro v0.4.0 reader accepted both 64-sample player observations, measuring 111.592 m of sampled glide, 6.007 m minimum glide clearance and zero impacts in each. [Native receipt](joint-flight.json) · [Layout](layout.txt) · [Fresh observation](fresh-observation.json) · [Reopened observation](reopened-observation.json) · [Fresh reader result](fresh-producer.json) · [Reopened reader result](reopened-producer.json)

| Measured item | Identity |
| --- | --- |
| Public-main source tree | `cb5158950278ead4c800c54dfee7dd360acff798` |
| Official build artifact | `15256599925`, ZIP SHA-256 `2b96bb555c0a39e79219e6ccd7ec502f3cd4adf2f8d56c7f1897420f3660277f` |
| NSIS installer SHA-256 | `1ef368e51b05d7d1660178a9efb9626b414f0fc33fcca2bbc82a33ff966f2602` |
| Installed executable | 18,225,664 bytes, SHA-256 `c8af4c3ebdcbfc19ace15d21c8ea3d7d7bdd51f95bf41ca7f30c9b4e09523275` |
| WebView2 JavaScript | `/assets/index-DleFn7qJ.js`, 1,307,632 bytes, SHA-256 `170b3c411f84f3057f1b175e70b3327e6ff20c8ac0190603ab68755eb2865ebe` |
| Public Switchyard GLB | 326,792 bytes, SHA-256 `7227e0cfe7d9c4051ea509e298028c7ae7eece2cde0e1d54b324f7f09197a348` |
| Repeat evidence artifact | `15258120359`, 238,928 bytes, ZIP SHA-256 `613003e9b9558fe2692efc2b0d7094d753741ed869575c08a61df53cc657342a` |

The installed WebView2 used SwiftShader on the Windows 2022 runner. The harness collected the bytes emitted at the game's download anchor. The earlier executable and its original receipts remain available under the earlier source identity. The captured Switchyard is © 2026 V2Wpro contributors, distributed under MIT. [Artifact file hashes](artifact.json) · [Earlier installed qualification](../README.md) · [MIT license](../../../../../licenses/V2Wpro-MIT.txt) · [Web qualification for the same source](https://github.com/styayur/Skimmer-Scraper/blob/c67d8f87e5b920019a7d46a3b1b0ec9ba0608882/acceptance/final-web-011/results/main-ac943acd/README.md)
