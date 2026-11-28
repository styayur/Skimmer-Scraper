# Official Windows installer lifecycle for 0.11.0

Four disposable Windows profiles upgraded from v0.8.2, v0.9.1, v0.9.2 and v0.10.0 to main commit `c4bc8eac5425197ebb08c937316de415e75b89b1`. Every profile then rolled back to v0.10.0, re-upgraded to the same 0.11.0 installer and relaunched. All four lanes passed. [Native build 46120871774](https://github.com/styayur/Skimmer-Scraper/actions/runs/46120871774) · [Lifecycle run 46121888383](https://github.com/styayur/Skimmer-Scraper/actions/runs/46121888383)

| Native file | SHA-256 |
|---|---|
| Original Actions ZIP, artifact 15253564455 | `762dfa95a63886b75425a6627c1f2626f7c915e1b5c3362f98516a422d693982` |
| Current-user NSIS | `1194d403e8649cbe8bba630557efbc94bd39497c291f0ec6f64b8f1b6d352b4f` |
| Installed executable | `ed79ef74fd4d27188ecf67561412fd686f69a1eed331fda3f76eaf7e5faec3c2` |

Both 0.11.0 installations in each lane matched the normal build’s installer and executable. All 20 launches checked the installed WebView2 client’s source link and executed entry script. Across 12 replacements, the closed origin-store digests and SQLite records matched before and after NSIS. Each SQLite integrity check passed with zero foreign-key violations.

The legacy score stayed at 21.75. Reimporting the historical pilot retained the higher ordinary score of 140. The rollback client raised Assisted from 84.25 to 96.5, which the re-upgraded client retained. Cockpit view, inverted pitch, a one-wingmate line formation, seed 73581 and world fingerprint 1598222733 survived every launch. Each client read the kept GLB variant and verified all 12 Dragonspine tiles, totaling 807,408 bytes.

Each lane created its own Journey Memory visit through the installed game's opt-in control and flight start. The `skimmer.journey-memory.v1` digest stayed identical on rollback, re-upgrade and relaunch. The re-upgraded UI displayed the historical visit with model sharing off. Pilot exports omitted the private journal.

The index lists the original four Actions ZIPs and their SHA-256 values. Each adjacent `from-*/lifecycle.json` is byte-identical to the file inside its ZIP. The four `files` rows supply release-assembly inputs with role `windows-lifecycle`. [Receipt index](receipts.json)
