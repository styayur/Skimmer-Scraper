# Foreground desktop flight qualification

Run one Web and one Windows flight per source revision on the same interactive
AMD Radeon 780M display. Each flight must accumulate at least 901 seconds in
both the shipping fixed-step simulation and wall time. Use the same monitor
mode, GPU driver and power configuration for the baseline and candidate.

The v0.10 baseline uses `991138b8c67c188bd47731d6c193142750225818`.
The integrated candidate uses `0a5272b36352a1300253080bd38cfb5d520c7e0d`
and Windows executable SHA-256
`d74696be680324a79b615e5badc0778568a8825b9e2c3f2c90f7386df09bfff8`.
The frozen static candidate contains 104 verified files.
[Baseline release](https://github.com/styayur/Skimmer-Scraper/releases/tag/v0.10.0)
· [Candidate Windows build](https://github.com/styayur/Skimmer-Scraper/actions/runs/46110688101)
· [Host and binary hashes](host.json) · [Frozen static manifest](candidate-0a5272b/dist-sha256.json)

Each result belongs to the revision recorded in its runtime metadata. For the
corrected release controller, use the merged source SHA and its official Web
and Windows artifacts. Record the Web file hashes and the CI-installed client
digest, then run both 901-second flights in sequence on the same display.
Reusing measurements across source revisions requires byte-for-byte evidence
for the complete runtime, including workers, game code, models, audio and any
native code on the Windows execution path.

The attempt ledger links the measurement history to the original failure
receipts. When a rejected attempt produced samples, its partial telemetry is
retained with the receipt. [Attempt ledger](attempts.json) · [Rejected attempts](rejected/)

## Controlled merged-release repeat

Stock Web averaged 109.19 FPS with a 16.7 ms p95 across 901.86 simulation
seconds and 916.87 wall seconds. It completed 72 scheduled circuit placements
and two scripted inversions across seeds 334458, 479568308 and 501763084.
The observer recorded 9,132 foreground checks. Total host CPU measured 6.78%
median and 21.14% p95 before launch, then 17.04% median and 35.13% p95
during the flight. [Stock Web frames and resources](controlled-repeat/stock/web/)

The maintainer superseded `c4bc8ea` during its first Web admission to correct
a test assertion reported by CodeQL. The sampler stopped before client launch.
The corrected main artifacts are pending. [Registered order](final-repeat.md)
· [All controlled attempts](controlled-repeat/suite.json)
· [Superseded build identities](superseded-c4bc8ea/inputs.json)

## Measured initial candidate

| Legacy city | Stock FPS | Candidate FPS | Change | Stock p95 | Candidate p95 | Change | Full-run gate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Web | 85.19 | 86.20 | +1.18% | 17.9 ms | 17.0 ms | −5.03% | Pass |
| Windows | 78.08 | 72.58 | −7.04% | 23.7 ms | 25.0 ms | +5.49% | **Mean FPS failed** |

All four flights completed more than 901 simulation and wall seconds. All
three companions stayed deployed, default music played, and both scripted
world swaps released their BVHs and scene children. Additional natural
crossings numbered 11 on both stock platforms, 13 on candidate Web and 10 on
candidate Windows. [Machine-readable results and diagnosis](results.json) · [Controlled repeat protocol](final-repeat.md)

In the first 240 seconds on Windows, both clients flew seed 334458. Stock and
candidate averaged 84.47 and 80.27 FPS, with p95 frame times of 20.6 and
18.5 ms. Across the full Windows runs, median GPU timer values were 6.43 and
7.35 ms, and median rendered triangles were 379,532 and 412,824. Median active
chunks, static BVHs and dynamic BVHs were 36, 36 and eight on both. Roughly
the last 300 seconds ran on different worlds, seed 2436865534 for stock and
4183856814 for the candidate. Total host CPU and function-level CPU timing
were unavailable in this first pair. The data establish a Windows mean-FPS
failure and leave its cause undetermined. [Stock Windows samples](v0.10.0/windows/) · [Candidate Windows samples](candidate-0a5272b/windows/)

Every sampled Windows glide state was `FLIGHT` in both versions, 946 stock
samples and 942 candidate samples. In this state the candidate returns from
`stepGlide` before terrain-following work. The automatic semantic survey also
checks for independent companion behavior before computing a perception. The
fresh-profile default is formation. A function-level CPU profile would be
needed to attribute the regression to a particular call. [Flight-state guard](https://github.com/styayur/Skimmer-Scraper/blob/0a5272b36352a1300253080bd38cfb5d520c7e0d/src/flight/surfaceGlide.ts#L138-L143) · [Survey guard](https://github.com/styayur/Skimmer-Scraper/blob/0a5272b36352a1300253080bd38cfb5d520c7e0d/src/ai/SymbiosisRuntime.ts#L492-L499) · [Companion defaults](https://github.com/styayur/Skimmer-Scraper/blob/0a5272b36352a1300253080bd38cfb5d520c7e0d/src/companions/settings.ts#L6-L11)

| Kinetic City | Simulation / wall | Mean FPS | p95 | Peak chunks / cap | Peak BVHs | Peak resident geometry | Peak collision triangles |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Web | 181.4 / 228.0 s | 98.12 | 16.8 ms | 36 / 41 | 36 | 17,925,264 B | 100,188 |
| Windows | 181.0 / 226.3 s | 87.70 | 22.3 ms | 36 / 41 | 36 | 18,093,264 B | 98,144 |

Both Kinetic flights completed two scripted and ten natural crossings. The
highest observed per-world retirement counts were 147 on Web and 102 on
Windows. Both played music, reached the 32-event voice history cap, and had
zero queued speech or active mission target references in the default
formation. These flights measured the default team workload. [Web samples and screenshot](candidate-0a5272b/kinetic/web/) · [Windows samples and screenshot](candidate-0a5272b/kinetic/windows/)

The official v0.10 static ZIP contains 101 files. All 100 files other than
the build-metadata JSON matched the first stock Web flight byte for byte,
including the entry script, workers, models and audio. The metadata records
the local Windows build toolchain or the official Linux build toolchain. The
controlled repeat uses the extracted official ZIP. [Official stock manifest](v0.10.0/official-dist-sha256.json) · [Stock release](https://github.com/styayur/Skimmer-Scraper/releases/tag/v0.10.0)

## Run an exact revision

Install the repository's locked development dependencies with `npm ci`. The
runner uses installed Microsoft Edge, WebView2, Python 3 and Windows PowerShell.
Use a clean, frozen static build and the extracted Windows portable executable
with its adjacent `build-info.json`, or pass `--native-build-info` with the
Windows CI artifact's `dist/build-info.json`. Obtain the executable SHA-256 independently
from the verified release archive or the matching Windows CI hash receipt.

To rebuild the Web candidate in a new sibling checkout and retrieve the Windows
artifact from the measured run, execute these commands from this repository.
Use an unused path for each destination. The measured Web builds used Node
26.7.0 on Windows x64. The Windows CI builds used Node 24.22.3. Compare the
rebuilt Web files with the archived manifest to confirm identical bytes.

```powershell
$Revision = '0a5272b36352a1300253080bd38cfb5d520c7e0d'
$CandidateCheckout = Join-Path (Get-Item ..).FullName 'Skimmer-0a5272b-qualification'
$ReceiptDir = Join-Path (Get-Item ..).FullName 'Skimmer-0a5272b-windows-receipt'
git fetch origin $Revision
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
git worktree add --detach $CandidateCheckout $Revision
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm --prefix $CandidateCheckout ci
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm --prefix $CandidateCheckout run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
gh run download 46110688101 --repo styayur/Skimmer-Scraper --name "windows-x64-$Revision" --dir $ReceiptDir
```

Use the complete manifest to verify a frozen copy before and after testing. For
a new official build, run `--record` on the extracted Web artifact with its
expected SHA and an unused manifest path, then use `--verify` on the working
copy with that same manifest.

```powershell
node scripts/qualification/dist-manifest.mjs --verify $WebDist $Revision acceptance/foreground-qualification/candidate-0a5272b/dist-sha256.json
```

The installer in the downloaded artifact can be extracted into an empty folder
with an NSIS-capable archive reader. Match `skimmer-scraper.exe` against its
entry in `acceptance/installed-smoke/hashes.json`. Pass the extracted executable
and `dist/build-info.json` from that artifact to the runner below.

The following PowerShell commands take a full source SHA, an absolute dist
directory, a portable executable, its verified digest and a new output root.
For a candidate Windows CI build, dispatch `windows-desktop.yml` on the candidate
branch with `expected_sha` set to that exact SHA.

```powershell
param(
  [Parameter(Mandatory)][ValidatePattern('^[0-9a-f]{40}$')][string]$Revision,
  [Parameter(Mandatory)][string]$WebDist,
  [Parameter(Mandatory)][string]$PortableExe,
  [Parameter(Mandatory)][ValidatePattern('^[0-9a-fA-F]{64}$')][string]$ExecutableSha256,
  [Parameter(Mandatory)][string]$Results,
  [string]$NativeBuildInfo
)

$web = Join-Path $Results web
$windows = Join-Path $Results windows
node scripts/qualify-foreground.mjs --sha $Revision --dist $WebDist --seconds 901 --output $web
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$nativeMetadata = @()
if ($NativeBuildInfo) { $nativeMetadata = @('--native-build-info', $NativeBuildInfo) }
node scripts/qualify-foreground.mjs --sha $Revision --dist $WebDist --seconds 901 --output $windows --exe $PortableExe --exe-sha256 $ExecutableSha256 @nativeMetadata
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node scripts/compare-foreground.mjs --parity $web $windows
```

Compare each candidate with its own platform's baseline. The comparator verifies
the compressed raw data digest, recalculates FPS and p95, and checks that the
measured settings and renderer match. Replaying committed samples requires only
Node 24 or newer and works on Linux, macOS and Windows. The regression limits are a 5% mean FPS
decrease and a 10% p95 frame-time increase over the full run. The report also
shows the first 240 wall seconds when the flight stayed on the initial world.
That interval helps interpret runs with different numbers of natural crossings.

```powershell
node scripts/compare-foreground.mjs --regression (Join-Path $Baseline web) (Join-Path $Candidate web)
node scripts/compare-foreground.mjs --regression (Join-Path $Baseline windows) (Join-Path $Candidate windows)
```

For the independent new-world budget, add `--world kinetic-city --seconds 180`
to each platform's runner command and give it a fresh output directory. This
profile starts at the generated spawn, holds boost and places each threshold
approach at the current horizontal position. It checks that chunks actually
retire, every observed resident count fits the streamer's configured cap, and
both world swaps release their geometry. The raw samples include generation,
retirement, rebases, mission records, active mission target references, their
world epochs and voice-queue counts. Active mission targets must belong to the
current epoch. The team has one mission slot per deployed companion and a
24-record history. The voice queue holds three pending lines and the playback
event history holds 32. Direct mission-reference counts come from the public
snapshot. The candidate also caps nearby authored hints at 32, verified sites
at six per picture, and retained perception pictures at 16. Those three limits
come from source inspection. The measured Kinetic City envelope has no v0.10
counterpart. [Streamed hints](https://github.com/styayur/Skimmer-Scraper/blob/0a5272b36352a1300253080bd38cfb5d520c7e0d/src/world/worldStreamer.ts#L420-L439) · [Verified sites](https://github.com/styayur/Skimmer-Scraper/blob/0a5272b36352a1300253080bd38cfb5d520c7e0d/src/ai/semanticTargets.ts#L65-L73) · [Retained pictures](https://github.com/styayur/Skimmer-Scraper/blob/0a5272b36352a1300253080bd38cfb5d520c7e0d/src/ai/SymbiosisRuntime.ts#L170-L180)

```powershell
node scripts/compare-foreground.mjs --budget (Join-Path $KineticResults web) (Join-Path $KineticResults windows)
```

## What the runs measure

The v0.9.2 foreground procedure supplies the Sakura route, ordinary keyboard
input, shielded Free Flight, three companions and two scripted Sky Inversion
approaches. The seed is 334458, the generator is version 4, and graphics quality
is High. Preparation and approach positioning use the game's pause, setPose and
resume controls. Each crossing must advance the seed and world index, finish all
six inversion phases and release the previous world's BVHs and scene children.
Natural crossings are counted separately.

Both clients use ANGLE D3D11 on the real GPU and a 1920 × 1080 viewport at DPR 1.
The runner records the canvas drawing buffer, active graphics backend, user agent,
camera, world, aircraft and music settings. A foreground window observer checks
the launched window and waits 100 ms between checks. The page also watches blur and visibility, and
rejects focus loss during measurement. Temporary display wake requests last for
the observer's lifetime. The browser runs with a fresh Playwright profile. The
portable runs only after a child-process check of the Windows local and roaming
known folders, with a fresh WebView2 profile and a verified application library
path inside it. Asset hashes refer to the code actually delivered by each build.
The native check also hashes the module WebView2 executed.

`samples.json.gz` contains chronological animation-frame intervals and roughly
one world/resource/music sample per second. Mean FPS is the frame count divided
by total sampled interval. The p95 is the nearest-rank percentile of those
intervals. `result.json` records the counts, observed resource bounds, music
playback, crossings and SHA-256 of the raw evidence. GPU timings and JavaScript
heap counters are included when the runtime provides them. Fresh output
directories also retain setup and progress records for interrupted attempts.
