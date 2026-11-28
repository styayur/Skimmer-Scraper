# Installed Switchyard on public main 67a56870

All four standard virtual LB captures and active releases passed in the installed WebView2 client on `67a568705cd0cabe18d467f465ae745e784aa245`. A GitHub-hosted Windows 2022 runner installed the verified NSIS package, opened the confirmed v0.4 catalog entry, then flew it again after submitting the exported layout from a fresh built-in world. The run finished at 2026-11-28 12:02:41 UTC. [Official Windows build](https://github.com/styayur/Skimmer-Scraper/actions/runs/46141199192) · [Hosted installed verification](https://github.com/styayur/Skimmer-Scraper/actions/runs/46142189281) · [Original ZIP](raw.zip)

| Opening | First glide | Second glide | Active releases | Shield strikes | Downloaded player samples | Equal flight samples against `ac943acd` |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Fresh catalog import | 40.647 m | 75.431 m | 2 | 0 | 64 | 133/133 |
| Saved layout reopened | 40.647 m | 75.431 m | 2 | 0 | 64 | 133/133 |

| Opening / release | LB pressed in GLIDING | DETACHING | Returned to FLIGHT |
| --- | ---: | ---: | ---: |
| Fresh 1 | 1.275 s | 1.308 s | 1.533 s |
| Fresh 2 | 3.392 s | 3.417 s | 3.675 s |
| Reopened 1 | 1.275 s | 1.308 s | 1.533 s |
| Reopened 2 | 3.392 s | 3.417 s | 3.675 s |

The two openings matched on 133/133 samples of time, position, velocity, speed, phase, mode, surface distance, shield count and LB state. The largest positional difference was 0 m and the largest velocity difference was 0 m/s. The traces also record when the game polled the virtual controller. [Fresh input trace](fresh-lb.json) · [Reopened input trace](reopened-lb.json) · [Paired comparisons](comparison-to-ac943acd.json)

The catalog made 0 raw-asset requests before confirmation and 1 GET across both openings. The reopened player report identifies variant 0, the same authored spawn and 6,100 collision triangles from the exported layout. The installed client emitted both diagnostics through its download control. The official V2Wpro v0.4.0 reader accepted the fresh import and recognized the reopened layout. It measured 111.592 m of sampled glide on each opening. [Layout](layout.txt) · [Fresh diagnostic](fresh-observation.json) · [Reopened diagnostic](reopened-observation.json) · [Fresh reader result](fresh-producer.json) · [Reopened reader result](reopened-producer.json)

| Measured item | Identity |
| --- | --- |
| Public-main source tree | `a04cc7b34ac5369e3b8bf6dce84b7d851df9b1cf` |
| Official build artifact | `15262276244`, ZIP SHA-256 `a09d35d50fd12072afaae794abdc6174783fd252411c2ddb2da3360d86cc1ed9` |
| NSIS installer SHA-256 | `73216758e8b1489dd1e0afc5d860b49eb9f6c9e57f9a22c7cc1f54693be60fc1` |
| Installed executable | 18,225,664 bytes, SHA-256 `986953923a2c8fdfd9bb5c9dc2890b9d63ecb2a0463b4e6e968450c73203ae22` |
| WebView2 JavaScript | `/assets/index-BfgknBaX.js`, 1,307,692 bytes, SHA-256 `722ae5a1dd47688204352ca66dbf37f7bbcac4f4c4dff4012ba83680435f1a93` |
| Public Switchyard GLB | 326,792 bytes, SHA-256 `7227e0cfe7d9c4051ea509e298028c7ae7eece2cde0e1d54b324f7f09197a348` |
| Evidence artifact | `15262351420`, 238,915 bytes, ZIP SHA-256 `e01ad72577a9e8e84a3228d658e550aabae1e9d71dc305e301716f4916c579f5` |

The hosted renderer reported `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)`. This probe covers gamepad mapping, installed game behavior and the bytes emitted at the download anchor. Physical controls and hardware frame rate have separate trials. The Switchyard GLB is © 2026 V2Wpro contributors, licensed under MIT. [Native flight receipt](joint-flight.json) · [Original package and installed executable receipts](raw.zip) · [File hashes](artifact.json) · [Previous installed run](../46130586145/README.md) · [MIT license](../../../../../licenses/V2Wpro-MIT.txt)
