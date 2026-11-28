# Installed Windows Switchyard qualification

**Four active releases passed on the public-main Windows executable.** Hosted run 46121936254 finished on 2026-11-28 at 07:42:13 UTC. WebView2 flew two LB capture/release cycles from the fresh Switchyard import and repeated both after the exported layout was reopened from the installed local library. Each opening recorded zero shield strikes. All 133 paired times, phases and positions matched exactly. [Hosted Windows run](https://github.com/styayur/Skimmer-Scraper/actions/runs/46121936254) · [Native receipt](46121936254/joint-flight.json) · [Original raw ZIP](46121936254/raw.zip)

| Cycle on each opening | LB capture | First GLIDING | LB release from GLIDING | DETACHING | FLIGHT | Sampled glide |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| First | 0.250 s | 0.733 s | 1.275 s | 1.308 s | 1.533 s | 40.647 m |
| Second | 2.233 s | 2.267 s | 3.392 s | 3.417 s | 3.675 s | 75.431 m |

The 32 ms input traces include the pad edges, gamepad polls, velocity, clearance and shield counter. The two 15 Hz player exports each contain 64 samples. The v0.4 reader measured 111.592 m of sampled glide and 6.007 m minimum glide clearance on both. It classified the original opening as fresh and the second as an exact layout reopen. [Fresh input trace](46121936254/fresh-lb.json) · [Reopened input trace](46121936254/reopened-lb.json) · [Fresh observation](46121936254/fresh-observation.json) · [Reopened observation](46121936254/reopened-observation.json) · [Fresh reader result](46121936254/fresh-producer.json) · [Reopened reader result](46121936254/reopened-producer.json)

| Measured item | Identity |
| --- | --- |
| Public-main Skimmer source | `c4bc8eac5425197ebb08c937316de415e75b89b1` |
| Official Windows build | Run `46120871774`, artifact `15253564455`, ZIP SHA-256 `762dfa95a63886b75425a6627c1f2626f7c915e1b5c3362f98516a422d693982` |
| NSIS installer SHA-256 | `1194d403e8649cbe8bba630557efbc94bd39497c291f0ec6f64b8f1b6d352b4f` |
| Newly installed executable | 18,225,664 bytes, SHA-256 `ed79ef74fd4d27188ecf67561412fd686f69a1eed331fda3f76eaf7e5faec3c2` |
| WebView2 JavaScript | `/assets/index-DleFn7qJ.js`, 1,307,632 bytes, SHA-256 `170b3c411f84f3057f1b175e70b3327e6ff20c8ac0190603ab68755eb2865ebe` |
| Switchyard GLB | 326,792 bytes, SHA-256 `7227e0cfe7d9c4051ea509e298028c7ae7eece2cde0e1d54b324f7f09197a348` |
| Handoff evidence | Artifact `15253134775`, 238,895 bytes, ZIP SHA-256 `dee3dedfdc22ab45c5cf110434b13f530329a8da1e6dedc36327c46135f205c9` |

The official build supplied the installer and its measured catalog receipt. Its six-file artifact covered activation. The dedicated handoff measured the subsequent flights on the same executable. WebView2 ran at `http://tauri.localhost` on the Windows 2022 runner with SwiftShader. The native catalog recorded zero external requests before confirmation and one GET across both openings. The kept world and resubmitted layout restored the authored spawn, variant 0 and all 6,100 collision triangles. [Official build](https://github.com/styayur/Skimmer-Scraper/actions/runs/46120871774) · [Layout](46121936254/layout.txt) · [Raw artifact file hashes](46121936254/artifact.json)

The captured Switchyard is © 2026 V2Wpro contributors, distributed under MIT. The separate public-main Web qualification recorded 33/34 frozen dispositions and the original third-panel release-timing miss. [v0.4.0 Switchyard source](https://github.com/styayur/V2Wpro/blob/241bd0eec72439d77a43e8d289cc29c714bf0e4e/examples/switchyard.glb) · [MIT license](../../../../licenses/V2Wpro-MIT.txt) · [Final Web qualification](https://github.com/styayur/Skimmer-Scraper/blob/e6ee8e90def33f4430aed783cc61fb0a079450b1/acceptance/final-web-011/RESULTS.md)

## Procedure

The hosted procedure uses the installer from a successful Windows desktop dispatch on public main containing Skimmer PR #92. Its execution request records the source commit, original run ID and both published executable hashes. The runner verifies the artifact ZIP digest, hashes the installer, performs a current-user installation in a fresh runner directory, and hashes the installed executable before starting WebView2.

The catalog must display the official v0.4.0 Switchyard pin from V2Wpro commit `241bd0eec72439d77a43e8d289cc29c714bf0e4e`. The first opening uses the normal confirmation and session-only import. The runner measures the bytes returned by that single GET, the loaded JavaScript entry and the world collision identity. It then saves the active layout and observation, keeps the world in the local library, starts a fresh built-in world and submits the exact exported layout through the world settings form.

Both openings fly from the authored spawn. The standard-mapped virtual pad pulses LB (button 4) for one 32 ms sample at ticks 8, 40, 70 and 106. The first and third edges request capture, and the second and fourth request release. Each flight records the initial state and 132 intervals at 120 Hz game simulation. Each pair must start in FLIGHT, sustain GLIDING for at least five samples and more than five metres, register an LB edge from GLIDING, enter DETACHING and return to FLIGHT. The receipt retains shield impacts, sampled positions, gamepad polls, both active-release transitions, and fresh/reopened identity.

Each in-game observation keeps its player classification. The harness captures the exact bytes delivered to the renderer's download anchor and saves them in the runner artifact. The official producer reader checks both against the received GLB. The standard Gamepad API is supplied by the harness. Physical hardware and the Windows Save As dialog are separate trials.
