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

`npm run verify` now performs all of the following:

1. registry validation
2. unit/conformance tests
3. TypeScript checking
4. production Solid SSR build
5. built-handler SSR smoke tests
6. `wrangler deploy --dry-run`

The dry run proves Cloudflare can package the generated production artifact without requiring deployment credentials.

## First deployment

Authenticate Wrangler once:

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

After the Worker deployment is verified, add `deez.run` as a Cloudflare Worker custom domain in the Cloudflare account that owns the zone. Keep the custom-domain mutation separate from the app build so a clone/fork cannot accidentally claim or alter production DNS.

Once the domain is serving correctly:

- redirect HTTP to HTTPS at Cloudflare
- enable HSTS only after HTTPS behavior is verified
- verify `/`, `/nuts`, `/docs`, `/publish`, `/sitemap.xml`, and `/robots.txt`
- publish and verify the first real `/nuts/:slug` page

## CI deployment later

A GitHub Actions deployment workflow can be added after the Cloudflare account/token model is chosen. It should use repository/environment secrets rather than committing credentials and should preserve the existing PR verification gate.
