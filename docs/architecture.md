# deez.run architecture

## Decision summary

deez.run uses one production server: the real Deez Zig executable.

```text
AUTHOR-OWNED GITHUB REPOSITORY
        │
        │ immutable commit + path + SHA-256
        ▼
    deck.nut bytes
        │
        ▼
 GENERATED REGISTRY / SEARCH DATA
        │
        ▼
 SOLIDJS 2 + STYLEX SPA
        │
        │ static Vite build
        ▼
      DEEZ ZIG
   ├── static SPA serving
   ├── SPA deep-link fallback
   └── /api/v1/*
        │
        ▼
      MONGODB
```

The public registry still keeps deck bytes in author-owned repositories and generates catalog/search data at build time. The hosted Deez process provides the same native application API surface used for decks, notes, cards, study, review, media, and stats rather than introducing a second backend implementation.

## Frontend boundary

The browser app uses SolidJS 2, Solid Router 2, StyleX, Vite, and TypeScript.

Vite and Node are build tools only. Production receives static `dist` output. Deez serves those files itself and falls back to `index.html` for non-API browser routes so `/nuts`, `/docs`, and other client-side routes work on a direct request.

StyleX is the application styling layer. The frontend does not own scheduling or storage semantics.

## Backend boundary

Deez Zig owns:

- HTTP API routing
- decks, notes, cards, and media
- study queue selection
- review writes
- FSRS scheduling
- stats
- storage abstraction
- SPA/static-file serving

Production sets `DEEZ_STORAGE=mongodb`; local development and CI smoke tests may use SQLite.

The immutable review log remains authoritative while scheduler state is derived/rebuildable, following the Deez core model.

## Registry ownership vs content ownership

### Registry owns

- stable public slug
- display name and description
- author attribution
- catalog tags
- optional license declaration
- source repository identity
- published semantic versions
- immutable Git commit + `.nut` path for each version
- SHA-256 for the exact bytes of each published version

### Authors own

- the actual `.nut` bytes
- repository history
- source README and supporting material
- licensing files
- release process inside their repository

### Build tooling derives

- deck name from the `.nut` header
- Deez `.nut` format/version
- exact file size
- logical note count
- generated card count
- note types used
- safe preview records
- immutable raw/source URLs
- searchable catalog data
- sitemap

Derived data is intentionally not contributor-authored.

## Source identity

A registry version uses all three of:

1. full 40-character Git commit SHA
2. repository-relative `.nut` path
3. SHA-256 of the exact file bytes

Download links use the pinned commit. The registry never silently follows `main`.

## Search

The first catalog index is generated JSON imported by the frontend. Search normalizes and matches tokens across slug, name, description, tags, author identity, and derived note types. Normal catalog browsing does not depend on the GitHub REST API at runtime.

## Public routes

- `/`
- `/nuts`
- `/nuts/:slug`
- `/authors/:author`
- `/search?q=...`
- `/docs`
- `/publish`

API routes live under `/api/v1/*` and are never handled by SPA fallback.

## Deployment boundary

A multi-stage Docker build compiles the SPA and a pinned Deez commit. The final image contains neither Node nor the Zig compiler. Fly.io runs `/app/deez` as the application process on port 8080.
