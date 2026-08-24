# deez.run

Public discovery and distribution catalog for shareable Deez `.nut` decks.

This repository is intentionally separate from the Deez Zig core, the local `deez-web` application UI, and the desktop shell.

## First milestone

The first useful release is a GitHub-backed public catalog where a visitor can:

- search registered nuts
- open a stable `/nuts/:slug` page
- inspect metadata and a safe text preview
- see the exact source repository and pinned commit
- download the exact `.nut` bytes
- verify SHA-256 before importing locally

The registry stores metadata, not everybody's deck content. Public `.nut` files remain in their authors' GitHub repositories.

## Stack

- SolidJS 2 RC
- Solid Router 2 next line
- Vite 8
- `@solidjs/vite-plugin` start mode with SSR
- TypeScript
- npm
- generated registry/search data; no application database
- Cloudflare Workers + Static Assets as the initial deployment target

SolidStart is intentionally not required for this milestone; the Solid 2 Vite plugin provides the serving/SSR layer directly.

## Development

```bash
npm install
npm run dev
```

Validate the registry, tests, production SSR handler, and Cloudflare packaging:

```bash
npm run verify
```

Build and deploy after authenticating Wrangler:

```bash
npm run deploy
```

## Documentation

- [`docs/architecture.md`](docs/architecture.md)
- [`docs/registry.md`](docs/registry.md)
- [`docs/publishing.md`](docs/publishing.md)
- [`docs/security.md`](docs/security.md)
- [`docs/deployment.md`](docs/deployment.md)
