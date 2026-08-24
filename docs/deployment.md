# Deployment

## Initial target: Cloudflare Workers + Static Assets

The first deez.run deployment target is Cloudflare Workers with Workers Static Assets.

This is deliberately a **deployment choice**, not a catalog architecture dependency:

- Solid 2 already builds a web-standard Fetchable SSR handler at `dist/server/server.js`.
- Vite builds browser assets at `dist/client`.
- Wrangler packages the SSR handler as the Worker and uploads the client directory as static assets.
- The registry remains generated files with no runtime database.
- The browser still does not call the GitHub API during normal catalog browsing.

If deez.run moves to another Fetch-compatible host later, registry metadata and application routes do not need to change.

## Validate locally/CI

```bash
npm install
npm run verify
```

`npm run verify` performs all of the following:

1. registry validation
2. unit/conformance tests
3. TypeScript checking
4. production Solid SSR build
5. built-handler SSR smoke tests
6. `wrangler deploy --dry-run`

The dry run proves Cloudflare can package the generated production artifact without requiring deployment credentials.

## Manual GitHub production deployment

Production deployment is intentionally manual for the initial milestone. The repository includes `.github/workflows/deploy.yml`, exposed as the **deploy** workflow in GitHub Actions.

Add these repository or `production` environment secrets before the first run:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

The token should be scoped to the Cloudflare account that owns the Deez Worker and should have only the permissions required to deploy Workers.

Then run the workflow from GitHub:

1. Open **Actions**.
2. Select **deploy**.
3. Select **Run workflow** on `main`.

This works from GitHub web and the GitHub mobile app. The workflow runs the full verification suite before invoking `wrangler deploy`, so an invalid registry or broken production build cannot be deployed by that workflow.

The deploy is serialized with a `production` concurrency group so two production deployments cannot race each other.

## First local deployment

For a one-off local deployment instead of GitHub Actions, authenticate Wrangler once:

```bash
npx wrangler login
```

Then deploy:

```bash
npm run deploy
```

The initial config keeps `workers_dev` enabled so the Worker can be verified on its Cloudflare-provided hostname before routing the production domain.

## Connecting deez.run

Do not bake account-specific zone IDs or API tokens into this repository.

After the Worker deployment is verified, add `deez.run` as a Cloudflare Worker **Custom Domain** in the Cloudflare account that owns the zone. The Worker is the origin for deez.run, so a Custom Domain is preferable to a Worker Route in front of a separate origin.

Keep the custom-domain mutation separate from the app build so a clone/fork cannot accidentally claim or alter production DNS.

For the initial launch, use the apex `deez.run` hostname as canonical. If `www.deez.run` is enabled later, redirect it to the apex rather than serving two canonical hosts.

Once the domain is serving correctly:

- redirect HTTP to HTTPS at Cloudflare
- enable HSTS only after HTTPS behavior is verified
- verify `/`, `/nuts`, `/docs`, `/publish`, `/sitemap.xml`, and `/robots.txt`
- verify `/nuts/zig-basics`
- verify the pinned source/download link and displayed checksum

## Automatic deployment later

Do not enable deploy-on-push until the manual production workflow has been exercised successfully and branch protection is established. At that point the same workflow can safely evolve to deploy merged `main` commits automatically while keeping pull requests verification-only.
