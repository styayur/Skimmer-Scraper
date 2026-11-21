# Deployment

## GitHub Pages

The repository publishes the public static site through `.github/workflows/deploy-github-pages.yml`:

**https://styayur.github.io/Skimmer-Scraper/**

This is the only deployment target. v0.2.0 was verified on 2026-11-09 for deployed main commit
`e56b034492f71ee7f1d3a51468df13c1850fa13d`: HTTP 200, WebGL2, both camera modes, project-subpath
assets, the world-mode selector, share-link parameters and an Ephemeral flight. That result belongs
to the deployed commit above. It is not evidence that a later commit is live.

For v0.3 onward, only stable `vMAJOR.MINOR.PATCH` tags trigger automatic deployment.
Phase merges and RC tags leave production untouched. `workflow_dispatch` remains
an explicit maintainer deployment action. For v0.5.0, use the stable tag after
the release PR and the merged source pass CI and the candidate gates.

Before promotion, check that the `github-pages` environment allows a Tag rule
for `v0.5.0`. At candidate verification the only rule was the `main` Branch
rule. Keep the release a prerelease while the tag is ineligible. A repository
owner can add the exact tag under **Settings → Environments → github-pages →
Deployment branches and tags**. [GitHub deployment environment rules](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)

Verify a candidate under the project subpath before publishing. For a local
build, run `npm ci`, `npm run test:all`, and `npm run preview -- --base
/Skimmer-Scraper/`. Run `node scripts/verify-v050.mjs` with `SKIMMER_URL` set to
that preview URL, `SKIMMER_EXPECTED_VERSION` set to the candidate version and
`SKIMMER_EXPECTED_COMMIT` set to the built revision. Set `SKIMMER_JOURNEY_SETS=2`
for two complete five-world runs in Chrome. The real GPU matrix and sustained
flight are exercised by `node scripts/v050-gpu.mjs matrix` and `soak`.

From the clean, verified release commit, use `npm run release:package -- <output>`
to create the static and source ZIPs, the release manifest and `SHA256SUMS.txt`.
On Windows, create the packaging checkout with
`git -c core.autocrlf=false worktree add --detach <directory> <commit>` before
installing and building so the workspace and source archive use the same bytes.
Keep the lockfile and the build toolchain recorded in the manifest. Source ZIPs
retain `SOURCE_REVISION.json` for a build without `.git`. The release's
`v0.5.0.json` is generated beside the archives so it can include their hashes
and the verified production SHA. Run `python scripts/verify-release-package.py
<output>` to check both archives and their embedded revision data.

After Pages reports a successful deployment, verify the public project URL with
`node scripts/verify-v050.mjs` and the expected version and commit. The smoke
loads real WebGL2, exercises flight, voice settings, local radio, a sky crossing
and GLB loading, and checks asset URLs and source provenance. [Public build metadata](https://styayur.github.io/Skimmer-Scraper/build-info.json)

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
