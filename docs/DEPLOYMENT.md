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
an explicit maintainer deployment action. Release gates and player-experience
issues are recorded in acceptance/v0.3.0.json before a stable tag is created.

The v0.3.0-rc.1 candidate is a GitHub prerelease with static/source ZIPs and
SHA256 manifests; it does not dispatch Pages or change the latest stable release.
Build and packaging instructions are in [V030-QA.md](V030-QA.md). Human experience
and the measured world-exchange frame spike remain stable-promotion gates.

Live evidence: `evidence/v0.2.0-live-pages-verification.json` and `evidence/v0.2.0-live-pages-*.png`.

## Cloudflare Pages

Cloudflare Pages deployment is cancelled. The dedicated workflow, Wrangler project config, and
`deploy:cf` script have been removed. Do not add Cloudflare API tokens, an account ID, a Pages
project, or a replacement deploy workflow for this repository. No Cloudflare Pages URL or deployment
success is claimed.

## Static host portability

`dist/` is platform-neutral and can be served by any HTTPS static host. No server-side runtime is
required. Keep the `_headers` file when a host supports response-header configuration.
