# Security and trust model

Public `.nut` files are untrusted user content. A registry merge means the file passed validation; it does not make note content executable or trusted HTML.

## Preview rendering

The public site follows these rules:

- user fields are inserted through normal Solid JSX text interpolation
- no `innerHTML` / `dangerouslySetInnerHTML`-style path is used for note content
- HTML-looking strings remain visible text
- `deez-media://sha256:...` is treated as an inert content identifier in `.nut` previews
- the first milestone does not fetch arbitrary remote media referenced by user content
- catalog-controlled GitHub links are constructed from validated repository, commit, and path data

A later rich renderer should parse a deliberately small display language rather than passing user HTML into the DOM.

## Registry validation

CI currently enforces:

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

The validator follows the live Deez core format closely, but Deez core remains authoritative. CI conformance fixtures should grow whenever the core adds a format feature.

## Why checksum and commit pinning both matter

A commit SHA gives an immutable Git identity while the repository remains available. SHA-256 gives Deez an independent content-integrity contract and catches accidental or malicious mismatches in registry metadata, transport, or source resolution.

## `.sack`

`.sack` deserves a separate threat model because it contains ZIP entries and binary media. Deez core already applies path, duplicate-entry, CRC, size, and SHA verification during import. deez.run should not begin hosting or previewing arbitrary `.sack` media until it has explicit limits and content-scanning/rendering policies.

## Follow-up hardening

Before production launch, add deployment-level headers including a restrictive Content Security Policy, `X-Content-Type-Options: nosniff`, an appropriate referrer policy, and frame-ancestor protection. These belong to the deployment target because the exact CSP must account for the generated Solid assets and hosting environment.
