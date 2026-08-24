# Publishing workflow

## Initial PR workflow

1. Validate the `.nut` locally with Deez.
2. Put it in a public GitHub repository.
3. Commit the exact file that will be published.
4. Capture the full commit SHA.
5. Calculate SHA-256 over the exact `.nut` bytes from that commit.
6. Add or update `registry/nuts/<slug>.json`.
7. Run `npm run registry:check`.
8. Open a pull request to `deez-run`.
9. CI re-fetches the immutable source, verifies SHA-256, validates the `.nut`, runs tests/type checking, and builds the public site.
10. Merge only after the registry checks pass.

The registry does not accept mutable `main`, `master`, branch, or tag names as a version source pin.

## Future CLI

A future local workflow can be:

```text
deez nuts publish deck.nut
```

Conceptually that command can:

- validate `.nut`
- verify the format/version
- compute SHA-256
- collect/check catalog metadata
- print or generate the registry JSON
- prepare a GitHub PR URL or patch

It should **not** start by silently mutating a user's GitHub account. Authentication and automated PR creation can be designed after the metadata contract has proven stable.

## Future search/install relationship

A later Deez CLI could consume the generated public catalog:

```text
deez nuts search "data structures"
deez nuts install data-structures
```

Install should resolve a registry version to an immutable source URL, download it, verify SHA-256, and then invoke the normal local `.nut` import path. deez.run remains discovery infrastructure rather than the user's study database.
