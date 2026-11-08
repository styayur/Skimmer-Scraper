# Deployment

## Cloudflare Pages

The static build is `dist/`. `wrangler.toml` declares the Pages output directory and the workflow at
`.github/workflows/deploy-cloudflare-pages.yml` deploys on `main` when repository variable
`CLOUDFLARE_PAGES_DEPLOY_ENABLED` is `true`.

Required repository secrets:

- `CLOUDFLARE_API_TOKEN` with Cloudflare Pages edit permission for the target account;
- `CLOUDFLARE_ACCOUNT_ID`.

Required one-time setup while authenticated with Cloudflare:

```powershell
npx wrangler pages project create skimmer-scraper --production-branch main
```

Then set the repository variable and secrets, run the deployment workflow, and verify the returned
HTTPS URL plus a real browser smoke test.

### Current status

As of 2026-11-08, the local Wrangler session is expired, no `CLOUDFLARE_API_TOKEN` or
`CLOUDFLARE_ACCOUNT_ID` is available, and the GitHub repository has no Cloudflare secrets.
Cloudflare Pages publication is therefore **blocked on user authorization**. This document does not
claim a live Pages deployment until one exists.

## Other hosts

`dist/` is a plain static bundle and can be served by any HTTPS static host. GitHub Pages may be used
as a temporary public preview if configured, but it is not a substitute for the requested Cloudflare
Pages release and must be labelled separately.
