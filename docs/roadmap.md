# deez.run roadmap

The public issue tracker originally described only the M0 catalog. The hosted product has since expanded into accounts, local-first replication, cross-device Study, and a production Fly.io deployment. This roadmap records the current product milestones without rewriting historical issues.

## M0 — Public nut catalog — complete

Public catalog/search, nut pages, author pages, immutable GitHub registry pins, validation, SEO, sitemap/robots, and production deployment. Closed by issues #2, #3, and #4.

## M1 — Hosted Deez — complete

Magic-link accounts, usernames, private cloud-backed libraries, canonical account convergence, MongoDB production storage, local IndexedDB cache/outbox, offline hydration, and cross-device deck/review state.

## M2 — Production UI — complete

GTA/neo-retro signed-in shell, account-aware navigation, responsive full-height app layout, Study styling, public-page visual convergence, and route-scoped WebAssembly CSP.

## M3 — Production reliability + Study UX — complete

Large portable imports are atomic and observable; replication uses bulk snapshots; Study has progress/undo; deck management is production-safe; mobile navigation and performance budgets are in CI. This became the v0.1.0 production baseline.

## M4 — Study feature completeness — active

Tracking issue: #47.

- Every current Deez interaction contract works in hosted Study: reveal, type-answer, single-choice, multiple-choice, ordering, and image occlusion.
- Study has presets and explicit session goals.
- Cards can be buried for the current session without immediately reappearing; cloud and offline queue selection both honor the exclusion.
- Review history and scheduler state are visible in Study.
- New/learning/relearning/review state is visible before rating.
- Keyboard and touch workflows remain first-class.
- Card content continues through the existing sanitizer and route-scoped CSP boundary.

Persistent user suspension is intentionally separate from Deez lifecycle retirement and will not be implemented by overloading retired-card state.

## M5 — Content and deck management — planned

Bulk note editing, tags/search/filtering, move/copy operations, conflict/recovery tooling, richer media workflows, reusable deck settings, and persistent card suspension with its own durable state.

## M6 — Publishing and community — planned

Publishing private nuts, profile/author improvements, version/update notifications, fork/clone workflows, discoverability/ranking, and stronger registry tooling.

## M7 — Stable production release — planned

Production monitoring, backup/recovery guarantees, migration contracts, mobile/PWA QA, performance SLOs, and a stable release line after the Study/content milestones settle.
