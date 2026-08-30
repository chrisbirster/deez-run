# deez.run

Public Deez web app and `.nut` discovery catalog.

This repository owns the browser application and deployment packaging. The Deez Zig core remains authoritative for storage, study, review, scheduling, and the HTTP API.

## Runtime architecture

```text
SolidJS 2 + StyleX SPA
        │
        │ built once by Vite
        ▼
static files in /app/web
        │
        ▼
Deez Zig server
  ├── serves SPA + deep-link fallback
  └── serves /api/v1/*
        │
        ▼
MongoDB in production
```

Node, npm, Vite, StyleX tooling, Python, and the Zig compiler are build-time dependencies only. The Fly runtime contains the compiled `deez` executable, static web assets, CA certificates, and the SQLite runtime library used for local/smoke configurations.

The production image pins Deez to an immutable commit so a deployment cannot silently pick up a different core revision.

## Frontend

- SolidJS 2 RC
- Solid Router 2
- StyleX
- Vite 8
- TypeScript
- generated registry/search data for public `.nut` discovery

Application styling lives in StyleX. The small static build is served directly by Deez; there is no Node or SSR server in production.

## Development

Install and run the frontend dev server:

```bash
npm ci
npm run dev
```

Vite proxies `/api` to a local Deez server on `127.0.0.1:5882`.

Run the frontend verification suite:

```bash
npm run verify
```

CI additionally builds the complete production Docker image and smoke-tests the real Zig server for both `/api/v1/health` and SPA deep-link fallback.

## Deployment

Production targets Fly.io. Deployment is manual through the repository's `deploy` GitHub Actions workflow until the production path has been exercised and branch protection is finalized.

See [`docs/deployment.md`](docs/deployment.md) for setup.

## Documentation

- [`docs/architecture.md`](docs/architecture.md)
- [`docs/registry.md`](docs/registry.md)
- [`docs/publishing.md`](docs/publishing.md)
- [`docs/security.md`](docs/security.md)
- [`docs/deployment.md`](docs/deployment.md)
