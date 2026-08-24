# deez.run architecture

## Decision summary

deez.run begins as a public registry and catalog, not a cloud study backend.

The first architecture is:

```text
AUTHOR-OWNED GITHUB REPOSITORY
        │
        │ immutable commit + path
        ▼
    deck.nut bytes
        │
        │ SHA-256 verified by CI
        ▼
DEEZ.RUN REGISTRY METADATA
        │
        │ validate + derive
        ▼
 GENERATED CATALOG / SEARCH DATA
        │
        ▼
 SOLID 2 SSR PUBLIC WEBSITE
        │
        └── download points back to immutable GitHub source
```

No database is required for the first milestone. The public site does not read a user's local SQLite or MongoDB data and is not required for local Deez operation.

## Frontend choice

The site uses SolidJS 2, Solid Router's Solid 2 line, Vite, TypeScript, and npm.

We are **not** using SolidStart v2 for this milestone. The Solid 2 `@solidjs/vite-plugin` has a `start` mode that provides the serving layer directly, including streaming SSR, and keeps this catalog smaller than adopting a broader full-stack framework before it needs one.

Initial Vite configuration uses `start: true` plus `ssr: true`. If the catalog later proves completely static, the same registry model can feed prerendered/static delivery instead.

## Why SSR now

Public nut and author pages are canonical, shareable URLs. Rendering meaningful HTML on the first response helps crawlers, link previews, accessibility, and users with slow JavaScript. The content itself is build-generated, so SSR does **not** imply a database or a large backend.

Solid 2's head handling is used for route-specific titles, descriptions, canonical links, and basic Open Graph/Twitter metadata. Search result pages are `noindex`; stable catalog, nut, author, docs, and publish pages are crawlable. The registry build also emits `public/sitemap.xml` and `public/robots.txt` points crawlers at it.

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

### CI derives

- deck name from the `.nut` header
- Deez `.nut` format/version
- exact file size
- logical note count
- generated card count
- note types used
- safe preview records
- immutable raw/source URLs
- the generated searchable catalog
- the public sitemap

Derived data is intentionally not contributor-authored. This prevents stale counts and previews from becoming another source of truth.

## Source identity

A registry version must use all three of these:

1. full 40-character Git commit SHA
2. repository-relative `.nut` path
3. SHA-256 of the exact file bytes

A branch or tag alone is not a release identity because Git refs can move. GitHub's own blob identity is not a substitute for SHA-256 because the local Deez CLI can verify SHA-256 independently of GitHub.

Download links use the pinned commit. The registry never silently follows `main`.

## Search

The first index is generated JSON imported by the public frontend. Search normalizes and matches tokens across:

- slug
- name
- description
- tags
- author names/GitHub logins
- derived note types

This is enough for an early catalog and avoids a database, hosted search service, or runtime GitHub API dependency. Search result URLs are not canonical content pages and are marked `noindex`.

## Public URLs

Stable routes in milestone zero:

- `/`
- `/nuts`
- `/nuts/:slug`
- `/authors/:author`
- `/search?q=...`
- `/docs`
- `/publish`

The slug is the public identity. Version-specific canonical URLs can be introduced later without changing the initial slug page.

## GitHub API boundary

Browser requests should not call GitHub's REST API for normal catalog rendering. Doing so would couple page availability to API rate limits and make anonymous traffic expensive.

Registry CI fetches immutable raw source bytes during validation/build. The resulting catalog is what the site reads at runtime. A future periodic health job can re-check deleted or inaccessible sources separately.

## `.sack` boundary

`.sack` is deliberately separate from the first registry transport. It is a ZIP-compatible rich-media bundle containing `deck.nut` plus content-addressed media. Large binary artifacts have different storage, bandwidth, moderation, and malware-scanning concerns.

Future source strategies can include GitHub Releases, external artifact URLs, or deez.run-managed object storage. None is required for the textual `.nut` catalog.

## Business-model boundary

The free public catalog does not require an account. The architecture leaves room for future managed private decks, `.sack` hosting, backups, sync, teams, and private media, but those are separate products and threat models rather than prerequisites for public discovery.
