# Deployment

## GitHub Pages preview

The repository publishes a static preview through `.github/workflows/deploy-github-pages.yml`:

**https://styayur.github.io/Skimmer-Scraper/**

This is the primary public HTTPS release host. The v0.1.0 preview was verified on 2026-11-08. The
v0.2.0 release workflow verifies the deployed main commit with HTTP status, WebGL2, both camera
modes, world-mode selection, ephemeral mode and project-subpath asset loading. It is not represented
as a Cloudflare Pages deployment.

## Cloudflare Pages

The static build is `dist/`. `wrangler.toml` declares the Pages output directory and
`.github/workflows/deploy-cloudflare-pages.yml` deploys on `main` when repository variable
`CLOUDFLARE_PAGES_DEPLOY_ENABLED` is `true`.

Required repository secrets:

- `CLOUDFLARE_API_TOKEN` with Cloudflare Pages edit permission for the target account;
- `CLOUDFLARE_ACCOUNT_ID`.

Required one-time setup while authenticated with Cloudflare:

```powershell
npx wrangler login
npx wrangler pages project create skimmer-scraper --production-branch main
```

Then set the repository variable and secrets, run **Deploy Cloudflare Pages**, and verify the returned
HTTPS URL with the release browser test.

### Current status — 2026-11-09

- GitHub CLI is authenticated with repository/workflow permissions.
- The GitHub repository is public and GitHub Pages is enabled with workflow builds.
- The user signed into the Cloudflare dashboard through GitHub in Chrome.
- Wrangler still reports expired local OAuth and has no non-interactive refresh token.
- No `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` or matching GitHub repository secrets are present.
- Cloudflare Pages publication remains **BLOCKED_ON_AUTH / BLOCKED_ON_REPOSITORY_SECRETS**. No Cloudflare
  URL or deployment success is claimed. GitHub Pages remains the verified public release host.

## Static host portability

`dist/` is platform-neutral and can be served by any HTTPS static host. No server-side runtime is
required. Keep the `_headers` file when a host supports response-header configuration.
