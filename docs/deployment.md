# Deployment

## Production target: Fly.io

deez.run runs as one Fly application with one production server process: the compiled Deez Zig executable.

The Docker build is multi-stage:

1. Node builds the SolidJS 2 + StyleX SPA.
2. Zig 0.16 builds a pinned Deez commit.
3. the final image receives only the compiled `deez` executable, static SPA files, CA certificates, and the SQLite runtime library.

Node, npm, Python, and the Zig compiler are not present in the runtime image.

## Fly configuration

`fly.toml` currently defines:

- app: `deez-run`
- primary region: `iad`
- internal port: `8080`
- forced HTTPS
- automatic machine start/stop with one machine kept running
- `/api/v1/health` health check
- one shared CPU and 512 MB RAM
- `DEEZ_STORAGE=mongodb`
- `DEEZ_WEB_ROOT=/app/web`

The MongoDB connection string is a secret and must not be committed.

## Required production secrets

### Fly runtime

Set the Deez MongoDB URI on the Fly app:

```bash
fly secrets set DEEZ_MONGO_URI='mongodb://.../deez' -a deez-run
```

Use a replica-set-capable MongoDB deployment for the production path so Deez can use transactional review writes when available.

### GitHub Actions

The manual deploy workflow requires a repository or `production` environment secret:

- `FLY_API_TOKEN`

Prefer an app-scoped Fly deploy token rather than a broad personal token.

## Verification

Frontend verification:

```bash
npm install
npm run verify
```

CI then builds the complete production image and verifies:

- `/app/deez` exists and is executable
- `/app/web/index.html` exists
- Node, npm, Python, and the Zig compiler are absent from runtime
- the real Zig server answers `/api/v1/health`
- `/` is served by Deez
- direct SPA routes such as `/nuts` fall back to `index.html`

The container smoke uses SQLite deliberately so CI can validate the server/image boundary without production database credentials. MongoDB behavior remains covered by Deez core's Mongo integration workflow.

## Manual GitHub deployment

Production deployment is intentionally manual for the initial Fly rollout. The repository's `.github/workflows/deploy.yml` is exposed as the **deploy** workflow in GitHub Actions.

After `FLY_API_TOKEN` is configured and the Fly app has its `DEEZ_MONGO_URI` secret:

1. Open **Actions**.
2. Select **deploy**.
3. Select **Run workflow** on `main`.

The workflow runs the frontend verification suite, builds the production Docker image, installs `flyctl`, then runs:

```bash
flyctl deploy --remote-only
```

Production deployments use a `production` concurrency group so two deploys cannot race.

## First Fly setup

If the application does not exist yet, create it once from an authenticated machine:

```bash
fly apps create deez-run
fly secrets set DEEZ_MONGO_URI='mongodb://.../deez' -a deez-run
```

Then either run the GitHub workflow or deploy locally:

```bash
fly deploy
```

Do not store the MongoDB URI in `fly.toml`, the Dockerfile, or repository secrets intended only for build-time use.

## Domain

After the Fly deployment is healthy, attach `deez.run` to the `deez-run` Fly app and follow Fly's certificate/DNS instructions. Keep the apex hostname canonical; if `www.deez.run` is added later, redirect it to the apex.

Before calling the deployment complete, verify:

- `/api/v1/health`
- `/`
- `/nuts`
- `/docs`
- `/publish`
- `/sitemap.xml`
- `/robots.txt`
- a concrete nut page and its pinned source/download link

## Automatic deployment later

Do not enable deploy-on-push until the manual production workflow has been exercised successfully and branch protection is established. The same Fly workflow can then evolve to deploy merged `main` commits automatically while keeping pull requests verification-only.
