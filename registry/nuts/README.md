# Nut registry entries

One JSON file represents one stable public nut slug. The `.nut` file itself does **not** live here unless the author independently chooses this repository as its source.

Example shape:

```json
{
  "schema_version": 1,
  "slug": "data-structures",
  "name": "Data Structures",
  "description": "A concise data structures deck.",
  "authors": [{ "github": "octocat", "name": "The Octocat" }],
  "tags": ["programming", "data-structures"],
  "license": "MIT",
  "source": {
    "type": "github",
    "repository": "octocat/data-structures-nut"
  },
  "versions": [
    {
      "version": "1.0.0",
      "commit": "0123456789abcdef0123456789abcdef01234567",
      "path": "data-structures.nut",
      "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    }
  ]
}
```

The values above are illustrative and intentionally do not point at a real deck.

Derived fields such as note count, card count, note types, file size, and previews are generated from the pinned source bytes. Do not add them to registry entries.
