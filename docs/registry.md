# Public nut registry

## Schema version 1

Each nut is one file:

```text
registry/nuts/<slug>.json
```

The registry schema is versioned independently of `deez.nut`. `schema_version: 1` describes catalog metadata; it does not change the deck file format.

## Identity rules

- Slugs are globally unique, lowercase, and hyphen-separated.
- A slug should be treated as stable after publication.
- Versions use semantic versioning.
- Every version pins a full lowercase 40-character Git commit SHA.
- Every version points to a safe relative path ending in `.nut`.
- Every version contains lowercase SHA-256 for the exact source bytes.
- `latest` is derived from semantic version ordering; contributors do not set it.

## Metadata

Human-maintained fields:

- `name`
- `description`
- `authors[]`
- `tags[]`
- optional `license`
- `source.repository`
- `versions[]`

The source repository is currently GitHub-only. That is a registry policy, not a permanent limitation of `.nut`.

## Derived catalog data

CI fetches every registered version and derives:

- `deck_name`
- `nut_format`
- `nut_version`
- `size_bytes`
- `note_count`
- `card_count`
- canonical `note_types`
- up to five preview notes
- pinned raw/source URLs

## Public registry policy vs Deez format compatibility

Deez core remains able to import legacy `.nut` v1 files. New public registry submissions require `.nut` v2 so the catalog can reason about logical notes, note types, previews, and generated card counts consistently.

This is a deez.run publishing rule, not a change to Deez core's backwards compatibility.

## Initial resource limits

For public-registry validation:

- `.nut` maximum: 10 MiB
- one NDJSON line maximum: 256 KiB
- logical notes maximum: 50,000
- generated public preview: first 5 notes

These are abuse/operational limits for deez.run and may evolve. They are not part of the `.nut` file-format specification.

## Source deletion and moves

A pinned commit protects against silent mutation but cannot guarantee that a public repository remains available forever. Later health checks should distinguish:

- healthy
- temporarily unavailable
- repository/path removed
- checksum mismatch (high-severity integrity failure)

A moved repository should be updated explicitly in registry metadata. Published version hashes must never be silently rewritten to different bytes.
