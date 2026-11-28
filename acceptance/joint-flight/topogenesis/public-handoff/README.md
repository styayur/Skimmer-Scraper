# Public Inspector-to-game handoff

This hosted check opens the official V2Wpro Inspector, follows its Switchyard flight link to the public Skimmer game, confirms the catalog import and exports a player observation. It keeps the layout, reopens it, exports a second observation and loads the first report into the public Inspector.

The runner uses the original `scripts/verify-partner-handoff.py` from Skimmer `ac943acd6a2c6d21431aa138327bc3e64ed8552f`, Git blob `cc0d2126ae4da6f566eedf68a95897494a198e8d`. The producer is V2Wpro `241bd0eec72439d77a43e8d289cc29c714bf0e4e`. The script takes that producer SHA, the Skimmer release SHA and a fresh output directory as positional arguments.

After the release coordinator confirms the Pages deployment and supplies the full release SHA, record the corresponding successful run ID in `pagesRun`, the confirmed SHA in `game`, and the pinned V2Wpro SHA in `producer`. Committing these fields to `request.json` in this directory on the evidence branch activates the check. The workflow verifies the Pages job and exact main commit through the read-only Actions API before starting Chromium on the Ubuntu runner.

The hosted artifact contains the original `player-observation.json`, `reopened-observation.json`, `switchyard-flight.png` and `handoff.json`, plus the file digests and provenance for the Pages deployment and verifier. [Hosted workflow](../../../../.github/workflows/public-partner-handoff.yml) · [Official verifier](https://github.com/styayur/Skimmer-Scraper/blob/ac943acd6a2c6d21431aa138327bc3e64ed8552f/scripts/verify-partner-handoff.py)
