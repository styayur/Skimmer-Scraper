# Public Inspector-to-game handoff

This hosted check opens the official V2Wpro Inspector, follows its Switchyard flight link to the public Skimmer game, confirms the catalog import and exports a player observation. It keeps the layout, reopens it, exports a second observation and loads the first report into the public Inspector.

The runner checks out Skimmer `ac943acd6a2c6d21431aa138327bc3e64ed8552f` and uses its original `scripts/verify-partner-handoff.py`, Git blob `cc0d2126ae4da6f566eedf68a95897494a198e8d`. The producer is V2Wpro `241bd0eec72439d77a43e8d289cc29c714bf0e4e`. Its normal three positional arguments select the official sites and a fresh output directory.

The evidence branch activates the check by committing a request containing the release coordinator's specified successful Pages run ID and the two source commits. The workflow checks the publication job and source through the read-only Actions API before starting Chromium on the Ubuntu runner. Its output includes the original `player-observation.json`, `reopened-observation.json`, `switchyard-flight.png` and `handoff.json`, plus the file digests and publication provenance. [Hosted workflow](../../../../.github/workflows/public-partner-handoff.yml) · [Official verifier](https://github.com/styayur/Skimmer-Scraper/blob/ac943acd6a2c6d21431aa138327bc3e64ed8552f/scripts/verify-partner-handoff.py)
