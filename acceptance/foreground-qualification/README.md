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

## Run an exact revision

Install the repository's locked development dependencies with `npm ci`. The
runner uses installed Microsoft Edge, WebView2, Python 3 and Windows PowerShell.
Use a clean, frozen static build and the extracted Windows portable executable
with its adjacent `build-info.json`, or pass `--native-build-info` with the
Windows CI artifact's `dist/build-info.json`. Obtain the executable SHA-256 independently
from the verified release archive or the matching Windows CI hash receipt.

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
  [Parameter(Mandatory)][string]$Results
)

$web = Join-Path $Results web
$windows = Join-Path $Results windows
node scripts/qualify-foreground.mjs --sha $Revision --dist $WebDist --seconds 901 --output $web
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node scripts/qualify-foreground.mjs --sha $Revision --dist $WebDist --seconds 901 --output $windows --exe $PortableExe --exe-sha256 $ExecutableSha256
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node scripts/compare-foreground.mjs --parity $web $windows
```

Compare each candidate with its own platform's baseline. The comparator verifies
the compressed raw data digest, recalculates FPS and p95, and checks that the
measured settings and renderer match. The regression limits are a 5% mean FPS
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
retirement, rebases, mission records and voice-queue counts. The measured
Kinetic City envelope has no v0.10 counterpart.

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
