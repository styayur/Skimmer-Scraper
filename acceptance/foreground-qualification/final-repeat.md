# Merged-release foreground repeat

The complete first Windows comparison remains a failed mean-FPS result for
`0a5272b`. This protocol was specified before receiving or measuring the
corrected merged release. It uses four new flights in a reserved desktop slot.

| Order | Client | Source |
| --- | --- | --- |
| 1 | Web | v0.10.0 stock |
| 2 | Web | Exact merged release |
| 3 | Windows | Exact merged release |
| 4 | Windows | v0.10.0 stock |

Use the main push CI artifact `release-web-<full-sha>` and the CI-installed
Windows executable for the same merged SHA. The staged Web artifact is the
Linux Node 24 production build. Record its Actions run, artifact ID and archive
digest, then verify the complete extracted Web file manifest and native SHA-256. Keep
the same stock binaries from the original comparison. Run one client at a
time. Reserve about 70–75 minutes after the Exchange replay, resource probes
and local packaging have finished. Record a minute of idle total host CPU
before each launch. Admit a run when median idle-period CPU utilization is at
most 15% and p95 is at most 25%. Preserve a rejected start and reschedule it
if this check fails. Record total host CPU throughout each flight. Keep every
timed result, including slow intervals.

Stock Web can start after the release has merged and its official builds are
underway. If an artifact arrives between legs, record the wait, the UTC start
and finish of each measured interval, and the gap to the next interval. Release
the display as soon as the fourth client and foreground observer exit.

Use the Radeon 780M, D3D11, High quality, 1920 × 1080 at DPR 1, shielded Free
Flight, chase camera, three companions and default music. Hold the same yaw
and boost keys as the historical flight. Every 12 simulation seconds, return
to the original reference approach at `(0, 390, 120)` with neutral attitude.
These repeated circuits control the sampled scenery. At 300 and 600 simulation
seconds substitute the scripted Sky Inversion approach and verify all six
phases and old-world disposal. The required world sequence is `334458`,
`479568308`, `501763084`. Reject an unscheduled crossing or a different seed.
Keep both simulation and wall time at or above 901 seconds, including the
normal cost of the repeated approach placements and world transitions.

Compare stock and final within each platform. Apply the original full-run
limits of 5% mean FPS loss and 10% p95 frame-time increase. Publish all raw
frame intervals, ownership checks, per-seed dwell, host CPU and available GPU
timings and renderer resources. The original open-route measurements remain
available alongside this controlled-route comparison.

Run each invocation from the reproduction instructions with `--route controlled
--seconds 901` and a fresh output directory. The runner saves `idle-cpu.json`
and puts in-flight CPU readings beside the frame intervals in `samples.json.gz`.
On Chromium versions that expose thread-tick performance metrics, the result
also includes renderer main-thread CPU deltas for the measured flight.
Use `--edge` with the same installed `msedge.exe` on both Web legs. The result
records its SHA-256 and the running browser version.

Before timing, the observer locates the window belonging to the launched test
process. If normal activation fails, it can temporarily raise that window
without activating it, confirm its root HWND and PID under the cursor, and
check that Windows reports the point as the titlebar. It rechecks the point
immediately before sending one mouse click, then restores the cursor and
original topmost state. Windows foreground ownership and DOM focus must both
pass before measurement starts. A later loss of foreground invalidates the
flight. Each fresh attempt retains its own admission sample and receipt.

The maintainer superseded main `c4bc8ea` after the stock Web measurement
to correct a test assertion flagged by the main CodeQL run. The first
candidate admission stopped before Edge launched. Stock Web retains its
original position in the four-flight order. The 105-file staged Web artifact
and installed executable from that checkpoint have independent identities.
[Superseded artifact identities](superseded-c4bc8ea/inputs.json)
· [Superseded Web inventory](superseded-c4bc8ea/served-files.json)

With the official archives extracted in fresh directories, use the following
PowerShell commands from this checkout. Supply the two Web roots, both
portable executable paths, the Windows build metadata for each release, the
installed Edge path, and an empty results root. Each command performs its own
60-second host admission check. An interrupted attempt needs a new output
directory. Keep its existing receipt.

```powershell
$Evidence = 'acceptance/foreground-qualification'
$Inputs = Get-Content -LiteralPath "$Evidence/controlled-repeat/inputs.json" -Raw | ConvertFrom-Json
$StockSha = $Inputs.stock.source
$FinalSha = $Inputs.final.source
$Runner = 'scripts/qualify-foreground.mjs'
$Manifest = 'scripts/qualification/dist-manifest.mjs'
$Route = @('--route', 'controlled', '--seconds', '901')

node $Manifest --verify $StockWeb $StockSha "$Evidence/v0.10.0/official-dist-sha256.json"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node $Manifest --verify $FinalWeb $FinalSha "$Evidence/controlled-repeat/served-files.json"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node $Runner --sha $StockSha --dist $StockWeb --edge $EdgeExe @Route --output "$Results/web-stock"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node $Runner --sha $FinalSha --dist $FinalWeb --edge $EdgeExe @Route --output "$Results/web-final"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node $Runner --sha $FinalSha --dist $FinalWeb --exe $FinalExe --exe-sha256 $Inputs.final.windows.executableSha256 --native-build-info $FinalMetadata @Route --output "$Results/windows-final"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node $Runner --sha $StockSha --dist $StockWeb --exe $StockExe --exe-sha256 $Inputs.stock.windows.executableSha256 --native-build-info $StockMetadata @Route --output "$Results/windows-stock"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
```

When the maintainer deploys Pages, obtain the Pages artifact actually used by
that successful deployment. Extract its `artifact.tar` into a fresh directory
and compare its complete file inventory with the staged manifest, including
hidden files and build metadata. Retain both artifact IDs and the comparison.
Any added, missing or changed file requires repeating the affected lane on
the deployed bytes. This comparison can run while the user has the desktop.

```powershell
gh run download $MainPushRun --name "release-web-$Revision" --dir $StagedWeb
node scripts/qualification/dist-manifest.mjs --record $StagedWeb $Revision $StagedManifest
gh run download $PagesRun --name $DeployedArtifactName --dir $PagesArtifact
New-Item -ItemType Directory -Path $DeployedWeb -ErrorAction Stop | Out-Null
tar -xf (Join-Path $PagesArtifact artifact.tar) -C $DeployedWeb
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node scripts/qualification/dist-manifest.mjs --verify $DeployedWeb $Revision $StagedManifest
```
