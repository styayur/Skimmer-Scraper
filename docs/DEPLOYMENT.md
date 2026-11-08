# Deployment

## GitHub Pages preview

The repository publishes a static preview through `.github/workflows/deploy-github-pages.yml`:

**https://styayur.github.io/Skimmer-Scraper/**

This is an HTTPS playable build and is labelled as the public preview. It was verified on 2026-11-08
with HTTP 200, WebGL2 and a Playwright start-flight smoke. It is not represented as the requested Cloudflare
Pages production deployment.

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

### Current status — 2026-11-08

- GitHub CLI is authenticated with repository/workflow permissions.
- The GitHub repository is public and GitHub Pages is enabled with workflow builds.
- Local Wrangler authentication has expired; non-interactive token refresh failed.
- No `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` or matching GitHub repository secrets are present.
- Cloudflare Pages production publication is therefore **BLOCKED ON USER AUTHORIZATION**. No live
  Cloudflare URL or successful deployment is claimed.

## Static host portability

`dist/` is platform-neutral and can be served by any HTTPS static host. No server-side runtime is
required. Keep the `_headers` file when a host supports response-header configuration.


