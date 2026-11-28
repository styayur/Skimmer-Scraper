# Official Windows installer lifecycle for 0.11.0

Four disposable Windows profiles upgraded from v0.8.2, v0.9.1, v0.9.2 and v0.10.0 to main commit `ac943acd6a2c6d21431aa138327bc3e64ed8552f`. Every profile then rolled back to v0.10.0, re-upgraded to the same 0.11.0 installer and relaunched. All four lanes passed. [Native build 46129495362](https://github.com/styayur/Skimmer-Scraper/actions/runs/46129495362) · [Lifecycle run 46130569084](https://github.com/styayur/Skimmer-Scraper/actions/runs/46130569084)

| Native file | SHA-256 |
|---|---|
| Original Actions ZIP, artifact 15256599925 | `2b96bb555c0a39e79219e6ccd7ec502f3cd4adf2f8d56c7f1897420f3660277f` |
| Current-user NSIS | `1ef368e51b05d7d1660178a9efb9626b414f0fc33fcca2bbc82a33ff966f2602` |
| Installed executable | `c8af4c3ebdcbfc19ace15d21c8ea3d7d7bdd51f95bf41ca7f30c9b4e09523275` |

Both 0.11.0 installations in each lane matched the normal build’s installer and executable. All 20 launches checked the installed WebView2 client’s source link and executed entry script. Across 12 replacements, the closed origin-store digests and SQLite records matched before and after NSIS. Each SQLite integrity check passed with zero foreign-key violations.

The legacy score stayed at 21.75. Reimporting the historical pilot retained the higher ordinary score of 140. The rollback client raised Assisted from 84.25 to 96.5, which the re-upgraded client retained. Cockpit view, inverted pitch, a one-wingmate line formation, seed 73581 and world fingerprint 1598222733 survived every launch. Each client read the kept GLB variant and verified all 12 Dragonspine tiles, totaling 807,408 bytes.

Each lane created its own Journey Memory visit through the installed game's opt-in control and flight start. The `skimmer.journey-memory.v1` digest stayed identical on rollback, re-upgrade and relaunch. The re-upgraded UI displayed the historical visit with model sharing off. Pilot exports omitted the private journal.

The index lists the original four Actions ZIPs and their SHA-256 values. Each adjacent `from-*/lifecycle.json` is byte-identical to the file inside its ZIP. The four `files` rows supply release-assembly inputs with role `windows-lifecycle`. [Receipt index](receipts.json)
