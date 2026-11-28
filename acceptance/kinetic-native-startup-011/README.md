# One native Kinetic City cold start

The prepared observation reserves 90 seconds of exclusive desktop time on the Radeon 780M. Expected client use is 20–40 seconds. The parent releases the slot after the user's controller session and Russell's native endpoint tests permit desktop use. The native launch uses the revised official Windows artifact from main after PR 97. [Release correction](https://github.com/styayur/Skimmer-Scraper/pull/97)

The native receipt will be `acceptance/kinetic-native-startup-011/result.json` on `codex/kinetic-native-cold-start`. Its flight-view JPEG will be captured after the timing endpoint. The staged binary inputs and local result live under `E:\GitHub\Skimmer-Scraper-artifacts\kinetic-native-cold-start-011`, in separate `staged-<source-prefix>` and `exact-<source-prefix>` directories.

## Clock and route

1. Before the slot, verify the official Windows workflow and archive, revised source SHA, NSIS bytes, Windows build metadata and the SHA-256 of the client installed and smoke-tested by CI. Prefer an existing installation of the same NSIS when its path is available. The release handoff also supplies the exact flight executable extracted from that installer. The receipt states which copy ran. Native application resources are embedded in the executable. [Input verification](prepare.py)
2. Create empty native Local, Roaming, Temp and WebView2 directories. Verify that the Windows Known Folders APIs resolve inside them. Spawn the normal native executable with zero arguments. The host monotonic clock starts immediately before spawn. The profile is cold. OS file caches, driver caches and the shared WebView2 installation retain their normal machine state.
3. On the default title, press the ordinary World shortcut **G**, select **Kinetic City**, **Stable**, seed **334458**, and submit. The product performs its normal document navigation. Click **Start Game** on the new title. The receipt records trusted menu, submit and start events, the world URL and both title observations.
4. Beginning with the first animation frame after Start, record the first submitted flight draw whose renderer timestamp matches that animation frame, whose Three.js draw serial advanced, and whose rendered aircraft position matches the simulation. The HUD must be visible, mode running, buffering clear, and the production 3 × 3 collision ring active. The adapter and streamer must agree on registered BVHs. In the same callback, resolve a physical deck contact and record its chunk, logical surface, geometry UUID, triangle, distance and world point. A first rendered flight frame may precede the first fixed physics step. The endpoint measures application draw submission. Display scanout latency is outside its definition. [Frame observer](observe.mjs)
5. Record process-to-frame, process-to-first-observed-title, title-to-menu, menu-to-submit, submit-to-Kinetic-title, Kinetic-title-to-Start and Start-to-frame independently. Each document has five browser/host clock exchanges. The narrowest round trip supplies a monotonic mapping and an uncertainty interval. The receipt preserves the observed host arrival, browser frame timestamps, UTC, and the measured interval spent attaching the read-only renderer observer before Start.
6. After the endpoint, verify the executed main-frame JavaScript against its embedded digest, source metadata against the installer, real Radeon renderer, focused native window and isolated library. Close the one launched client and remove its owned temporary profile. The 75-second watchdog is restricted to the spawned process. A failure retains its stage, last evidence and exit disposition, with no automatic second launch. [Native runner](launch.mjs)

## Preparation checks

The complete UI path and frame observer passed on GitHub-hosted Chromium using PR 97's Web build. The renderer submitted its first observed flight frame at the target spawn, with nine active ring cells, 32 registered BVHs and a 9.99988 m contact against `chunk:0:1:r0`. Its draw serial advanced from 150 to 165 and the stock renderer timestamp equalled the sampled frame timestamp. The raw receipt is labeled as a software Web rehearsal. Its timings apply to that hosted environment. An earlier rehearsal recorded the menu submission and timed out while Playwright separately awaited navigation. The current harness follows the product's title-ready signal after submission. The Windows Known Folders preflight and release-archive hash checks also passed privately without starting a client. [Successful hosted job](https://github.com/styayur/Skimmer-Scraper/actions/runs/46125184295) · [Raw Web rehearsal](web-ui-rehearsal.json) · [Earlier diagnostic](https://github.com/styayur/Skimmer-Scraper/actions/runs/46125010431)

## Invocation

Run input preparation against the shared `native-handoff.json` and its sibling official Actions ZIP. The optional `--installed-exe` accepts an existing local installation with the same verified executable SHA-256. The staging directory and result directory must each be new.

```powershell
python -B acceptance/kinetic-native-startup-011/prepare.py $NativeHandoff $StagedInputs
```

Once the parent announces the exclusive slot, supply that announcement as the clearance reference. The checkout named by `--tool-root` supplies the existing Playwright package and the repository's Windows Known Folders preflight.

```powershell
node acceptance/kinetic-native-startup-011/launch.mjs --inputs $StagedInputs --output $NewResultDir --tool-root E:\GitHub\Skimmer-Perf-011 --slot-clearance $ParentClearance
```

The separate Dragonspine research families remain scoped in issue 70 and the prior geometry evidence record. [Issue 70](https://github.com/styayur/Skimmer-Scraper/issues/70) · [Coverage limits](https://github.com/styayur/Skimmer-Scraper/blob/688888c6bffcc526e3a5ae014b992799138bff2a/acceptance/kinetic-residency-011/README.md#remaining-scope)
