# Security and trust model

Public `.nut` files are untrusted user content. A registry merge means the file passed validation; it does not make note content executable or trusted HTML.

## Preview rendering

The public site follows these rules:

- user fields are inserted through normal Solid JSX text interpolation
- no `innerHTML` / `dangerouslySetInnerHTML`-style path is used for note content
- HTML-looking strings remain visible text
- `deez-media://sha256:...` is treated as an inert content identifier in `.nut` previews
- catalog previews do not execute author-provided scripts or HTML
- catalog-controlled GitHub links are constructed from validated repository, commit, and path data

A later rich renderer should parse a deliberately small display language rather than passing user HTML into the DOM.

## Registry validation

CI enforces:

- exact registry object keys
- safe slug and source path syntax
- full immutable Git commit SHA
- SHA-256 of fetched bytes
- valid UTF-8
- public file and line-size limits
- strict `deez.nut` v2 deck header
- strict note record keys
- built-in note type and field-count rules
- tags JSON array
- structured choice/select/order validation
- image-occlusion media reference and mask validation
- derived card counts for built-in note types

The conformance tests include every current built-in Deez note type and accepted alias. Deez core remains authoritative; deez.run fixtures must change when the core format changes.

## HTTP boundary

The production HTTP server is Deez Zig, not Node.

Hosted mode validates the request `Host` and, when an `Origin` header is present, accepts only same-origin HTTP/HTTPS requests. API routes remain under `/api/`; static SPA fallback does not consume API paths.

The canonical Zig server also owns browser response hardening:

- `Content-Security-Policy`
- `Cross-Origin-Opener-Policy: same-origin`
- restrictive `Permissions-Policy`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`

The CSP allows resources from the same origin, data images, and no arbitrary remote scripts, objects, framing, or cross-origin connections. Because the production SPA is a static Vite/StyleX build, it does not require the old SSR inline-script allowance.

Fly additionally forces HTTPS before traffic reaches the application.

## Runtime minimization

The production image intentionally excludes Node, npm, Python, and the Zig compiler. They are only builder dependencies. This reduces the runtime surface to the compiled Deez process, its static assets, certificates, and required native runtime libraries.

CI asserts this boundary and smoke-tests the built container before merge.

## Storage secrets

Production uses MongoDB through Deez's storage abstraction. `DEEZ_MONGO_URI` is a Fly secret and must never be committed into the repository, Dockerfile, generated frontend, or `fly.toml`.

The browser does not receive database credentials and does not connect directly to MongoDB.

## Why checksum and commit pinning both matter

A commit SHA gives an immutable Git identity while the repository remains available. SHA-256 gives Deez an independent content-integrity contract and catches accidental or malicious mismatches in registry metadata, transport, or source resolution.

The Docker image applies the same idea to Deez itself: it builds an explicitly pinned core commit and verifies the checkout before compiling it.

## `.sack`

`.sack` deserves a separate threat model because it contains ZIP entries and binary media. Deez core applies path, duplicate-entry, CRC, size, and SHA verification during import. deez.run should not broadly host or preview arbitrary `.sack` media until explicit limits and content-scanning/rendering policies are in place.
