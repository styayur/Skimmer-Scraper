# Assemble a Skimmer v0.11.0 distribution

Run the helpers from a checkout of the release tools with Python 3.11+, Git and the locked npm dependencies. The product checkout, site files, Windows workflow artifact and output directory can all be separate. Set the variables below to absolute paths. Repeat preparations receive numbered directories under the same output root. A failed finish keeps its intermediate directory for diagnosis.

## Prepare the measured artifacts

```powershell
git -c core.autocrlf=false worktree add --detach $source $sha
python scripts/assemble-kinetic-release.py prepare --source $source --sha $sha --dist $dist --native $native --installed $installed --output $output --date $date
```

The printed staging path is `$output/<YYYY-MM-DD>-v0.11.0-<first 12 SHA characters>`. For a rehearsal, add `--rehearsal`. For a pre-sealed site, add `--site-seal <json>` with the expected `source` and a complete `files` map of relative path to SHA-256. The product checkout must be clean and its lockfile must match Git. The final site input is the extracted Pages artifact from the expected-SHA deployment.

The Windows input is the extracted `windows-x64-<sha>` workflow artifact. It contains `src-tauri/target/release/bundle/nsis/*-setup.exe`, `dist/build-info.json` and `acceptance/installed-smoke/{desktop-smoke,hashes}.json`. The installed input contains `skimmer-scraper.exe` and the complete installed `licenses/` tree. An extraction of that installer can supply these bytes when its executable matches the recorded installed hash. The default path is `$native/portable`.

Preparation reads the Authenticode status on Windows. For assembly on Linux, supply `--install-receipt <install.json>` from the matching Windows run with `sha`, `version`, `installer`, `installerSha256`, `installedExecutableSha256`, `installExit` and `signing`. The portable carries the installed application's build metadata. The static ZIP carries the site build metadata. The source identity, installer bytes, executed Windows client, site entry bundle, static notices and kinetic catalog attribution are checked separately.

`prepared/` contains the byte-identical static and root-index itch ZIPs, the full Git source archive with vendored GLib and security provenance, the installer and portable. The preparation receipt identifies both build toolchains. The existing independently measured installation is sufficient for this stage.

## Capture the ZIP and portable receipts

```powershell
$prefix = 'skimmer-scraper-v0.11.0'
python scripts/qualify-itch-zip.py --zip "$stage/prepared/$prefix-itch-html5.zip" --sha $sha --output "$stage/itch"
```

Use the printed itch run directory for `$itchRun`. It contains four locale and presentation receipts, their title and flight screenshots, and a summary tied to the final ZIP hash. The same four-case receipt can be reused for another assembly of those exact ZIP bytes.

On an isolated Windows qualification machine, extract the prepared portable ZIP to a new directory and run its client using the existing smoke harness. Supply the resulting `desktop-smoke.json` as `$portableSmoke`. This is a second execution in addition to the installed workflow smoke.

```powershell
Expand-Archive -LiteralPath "$stage/prepared/$prefix-windows-x64-portable.zip" -DestinationPath $freshPortableDir
$env:SKIMMER_QA_SHA = $sha
node scripts/desktop-smoke.mjs "$freshPortableDir/skimmer-scraper.exe" $portableEvidence
```

## Finish with the measured release inputs

```powershell
python scripts/assemble-kinetic-release.py finish $stage --high-pack $highPack --forge $forge --portable-smoke $portableSmoke --itch-evidence $itchRun --report $displayJson --visual $comparisonJpeg --evidence-index $index
python scripts/verify-release-package.py "$stage/release"
```

- `$highPack` contains the existing schema-2 Dragonspine high `world-pack.json` and its terrain files. `$forge` contains the WorldForge export inventory and its baked reference GLB. The dual-release helper checks both against the matching distribution and also rebuilds the character radio pack. A prior export can be reused when these byte checks pass.
- `$displayJson` is the author's release report with `version`, full `sourceCommit`, a `limitations` array and the measured results intended for readers. The helper preserves its display fields and adds the archive name, measured identities and visual SHA. `$comparisonJpeg` becomes `visual-comparison.jpg` next to `v0.11.0.json`.
- `$index` is JSON with the assembly's `sourceCommit` and a `files` array. Each row supplies `path` relative to the index, the file's `sha256`, the full `sourceCommit` it measured and its `role`. Include only intended public evidence. A row for an earlier experiment keeps that experiment's revision. The qualification ZIP retains these bytes, the index, new committed Topogenesis, City, glide and companion experiments (including failures), native receipts, itch captures, build metadata, credits and notices.
- Include `raw` and `failed` evidence. For a final assembly also include `source-rebuild`, `public-web`, `web-audio`, `desktop-audio`, `city-matrix`, `web-soak`, `desktop-soak`, `windows-lifecycle` and `linux-security`. Multiple rows can use the same role. Additional roles can identify controls, benchmark traces, older host experiments or individual CI receipts.
- The source rebuild receipt follows the existing `build`, `sourceZipSha256`, `deployedFiles`, `rebuiltFiles` and `differences` format. Rebuild from the **prepared source ZIP** on the site's recorded platform and Node version. The public Pages receipt follows the previous `live-proof.json` format with `build`, `workflow`, artifact `files` and `servedFiles`. Both inventories must match the static archive. Audio receipts retain `build`, `endpointVerified` and `issues`. For Windows lifecycle use the four actual `lifecycle.json` files, one per historical starting version. Upgrade and re-upgrade must identify the installer and executable hashes used in this assembly.

The final directory contains nine release assets, `release-manifest.json`, the versioned report, the comparison JPEG and `SHA256SUMS.txt`. The unchanged verification result format is saved alongside the directory at `$stage/verified-release.json`. A rehearsal is marked in its manifest and report. A labelled portable receipt fixture is accepted only in rehearsal mode. The package verifier reports archive integrity. Public deployment, final probe interpretation, promotion and download verification belong to the release owner. [Existing deployment and verification procedure](DEPLOYMENT.md)
