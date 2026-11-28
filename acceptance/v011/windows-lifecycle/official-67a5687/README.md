# Official 0.11.0 Windows installer lifecycle

All four fresh, current-user Windows installations passed on main `67a568705cd0cabe18d467f465ae745e784aa245`. Each lane upgraded to 0.11.0, rolled back to 0.10.0, re-upgraded with the same official NSIS and relaunched the game. [Normal Windows build](https://github.com/styayur/Skimmer-Scraper/actions/runs/46141199192) · [Hosted lifecycle run](https://github.com/styayur/Skimmer-Scraper/actions/runs/46142150268)

| Official file | SHA-256 |
|---|---|
| [Original Actions archive](https://github.com/styayur/Skimmer-Scraper/actions/runs/46141199192/artifacts/15262276244) | `a09d35d50fd12072afaae794abdc6174783fd252411c2ddb2da3360d86cc1ed9` |
| Current-user NSIS | `73216758e8b1489dd1e0afc5d860b49eb9f6c9e57f9a22c7cc1f54693be60fc1` |
| Installed client | `986953923a2c8fdfd9bb5c9dc2890b9d63ecb2a0463b4e6e968450c73203ae22` |

| Starting version | Hosted Windows job | Original receipt |
|---|---|---|
| 0.8.2 | [140970359382](https://github.com/styayur/Skimmer-Scraper/actions/runs/46142150268/job/140970359382) | [Lifecycle JSON](from-0.8.2/lifecycle.json) · [Complete ZIP](from-0.8.2.zip) |
| 0.9.1 | [140970359365](https://github.com/styayur/Skimmer-Scraper/actions/runs/46142150268/job/140970359365) | [Lifecycle JSON](from-0.9.1/lifecycle.json) · [Complete ZIP](from-0.9.1.zip) |
| 0.9.2 | [140970359373](https://github.com/styayur/Skimmer-Scraper/actions/runs/46142150268/job/140970359373) | [Lifecycle JSON](from-0.9.2/lifecycle.json) · [Complete ZIP](from-0.9.2.zip) |
| 0.10.0 | [140970359388](https://github.com/styayur/Skimmer-Scraper/actions/runs/46142150268/job/140970359388) | [Lifecycle JSON](from-0.10.0/lifecycle.json) · [Complete ZIP](from-0.10.0.zip) |

Each job began with an empty game profile and no existing HKCU uninstall registration. Eight upgrade and re-upgrade installations matched both official digests. The 20 installed WebView2 launches verified the running client’s source and first executed entry script.

All 12 pairs of closed-profile snapshots matched before and after the installer. SQLite integrity and foreign-key checks passed. The game read back the kept GLB variant and verified all 12 tiles in the Dragonspine pack, totaling 807,408 bytes.

The legacy score stayed at 21.75. Reimporting the original pilot preserved the higher ordinary score of 140, and the re-upgraded client retained the Assisted score of 96.5 written by the rollback client. The cockpit view, inverted pitch, one-wingmate line formation, seed 73581 and world fingerprint 1598222733 persisted.

After the first upgrade in each lane, the player opted in and started a flight. Each game recorded a distinct Journey Memory visit. The private journal in `skimmer.journey-memory.v1` retained its digest through rollback, re-upgrade and relaunch. Its visit returned in the re-upgraded UI with model sharing off. Pilot exports excluded the journal.

The index identifies the original Actions artifacts, snapshot digests, Windows jobs and release assembly inputs. Each standalone `lifecycle.json` preserves the bytes of the corresponding file in its ZIP. [Machine-readable receipt index](receipts.json)
