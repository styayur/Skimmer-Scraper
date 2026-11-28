# Deployment

## GitHub Pages

The repository publishes the public static site through `.github/workflows/deploy-github-pages.yml`:

**https://styayur.github.io/Skimmer-Scraper/**

This is the only deployment target. v0.2.0 was verified on 2026-11-09 for deployed main commit
`e56b034492f71ee7f1d3a51468df13c1850fa13d`: HTTP 200, WebGL2, both camera modes, project-subpath
assets, the world-mode selector, share-link parameters and an Ephemeral flight. That result belongs
to the deployed commit above. It is not evidence that a later commit is live.

The production deploy job runs only for `workflow_dispatch` on
`refs/heads/main`. The `github-pages` environment uses its existing `main`
branch rule for every release.

After the release PR merges and CI succeeds on that exact `main` commit,
dispatch the workflow with the verified SHA:

```sh
gh workflow run deploy-github-pages.yml --ref main -f "expected_sha=$verified_main_sha"
```

Set `verified_main_sha` to the full SHA that passed CI. The workflow compares
the supplied SHA with its dispatch SHA before checkout
and building. After the deployment and public browser smoke test pass for the
same commit and version, create the stable tag on that commit and publish the
GitHub Release with its archives and checksums. Tags serve as release references.

Verify the release candidate under the project subpath. For a local build,
run `npm ci`, `npm run test:all`, and `npm run preview -- --base /Skimmer-Scraper/`.
Run `node scripts/verify-v060.mjs` with `SKIMMER_URL` set to that preview URL,
`SKIMMER_EXPECTED_VERSION` set to the candidate version,
`SKIMMER_EXPECTED_COMMIT` set to the built revision and `SKIMMER_EVIDENCE_DIR`
set to a writable directory. Set `SKIMMER_FULL_JOURNEY=1` to run all five worlds.
The real GPU matrix and sustained flight are exercised by
`node scripts/benchmark-world-art.mjs <local-preview-url> matrix 4`. Use the matrix for city baselines. For current Windows Dragonspine qualification, run `scripts/desktop-smoke.mjs` with the installed executable, evidence directory, `pack` and the unpacked high terrain directory. Set `SKIMMER_SOAK_SECONDS=901` and `SKIMMER_QA_SHA` to the tested revision.

The main push CI stages `release-web-<full-main-sha>` from its first Chromium shard. Download this static build for the foreground Web qualification while the current public version is still live. Keep the full file inventory from that qualification for comparison with the published site.

For the complete deployment receipt, run `python scripts/verify-pages-release.py <run-id> <full-main-sha> <new-directory>` with authenticated GitHub CLI access. The command checks the GitHub artifact digest, extracts the site, and compares every file with the public response. Run `node scripts/qualification/dist-manifest.mjs --verify <new-directory>/site <full-main-sha> <qualified-manifest>` to compare it with the foreground build. Use its `site/` as the static release input and `live-proof.json` as deployment evidence.

Run the browser verifier against the public project URL with the final version and commit. Set `SKIMMER_DEPLOY_ARTIFACT_DIR` to the verified `site/` directory. The verifier compares hashes of the served
`build-info.json` and runtime entry bundle against the artifact. Check all three character previews and actual music output on the installed WebView2 and production Web clients.
[Public build metadata](https://styayur.github.io/Skimmer-Scraper/build-info.json)

Place the extracted deployment artifact at `dist/` in a clean checkout of the
verified release commit. Run `npm run release:package -- <output>` to create the
static and source ZIPs, the release manifest and `SHA256SUMS.txt`.
On Windows, create the packaging checkout with
`git -c core.autocrlf=false worktree add --detach <directory> <commit>` so the
workspace and source archive use the same bytes.
Keep the lockfile and the build toolchain recorded in the manifest. Source ZIPs
retain `SOURCE_REVISION.json` for a build without `.git`. Rebuild the extracted
Source ZIP with the recorded toolchain and compare it to the deployed files.
Place the versioned acceptance JSON and `visual-comparison.jpg` alongside the archives. Record the image digest in `visualComparisonSha256` in the report. Include both files in `SHA256SUMS.txt`. Run
`python scripts/verify-release-package.py <output>` on the bundle and again
on a fresh download from the published GitHub Release.
The distribution links to its complete corresponding source. It omits
bundler source maps because their synthetic asset references can differ
between builds from the same files.

The v0.3.0-rc.1 candidate is a GitHub prerelease with static/source ZIPs and
SHA256 manifests; it does not dispatch Pages or change the latest stable release.
Build and packaging instructions are in [V030-QA.md](V030-QA.md). Human controls,
art, transition pacing and AI teamwork remain to be reviewed for stable promotion.

Live evidence: `evidence/v0.2.0-live-pages-verification.json` and `evidence/v0.2.0-live-pages-*.png`.

## Cloudflare Pages

Cloudflare Pages deployment is cancelled. The dedicated workflow, Wrangler project config, and
`deploy:cf` script have been removed. Do not add Cloudflare API tokens, an account ID, a Pages
project, or a replacement deploy workflow for this repository. No Cloudflare Pages URL or deployment
success is claimed.

## Static host portability

`dist/` is platform-neutral and can be served by any HTTPS static host. No server-side runtime is
required. Keep the `_headers` file when a host supports response-header configuration.
