# Account convergence

Deez has one cloud library per verified signed-in account. Browser IndexedDB is an optional offline cache, not a separate account namespace.

## Online behavior

- `/api/v1/auth/me` resolves the canonical account identity for the verified email.
- If an older session points at a historical duplicate user id for that same email, its deck ownership is unioned into the canonical account and the session is migrated.
- App reads use the account cloud while online, while still surfacing durable local-only work that has not uploaded yet.
- Study can read/review a cloud card before a complete IndexedDB mirror exists.

## Offline behavior

- Existing IndexedDB data remains available offline.
- Durable local mutations remain in the outbox and replay when connectivity returns.
- Full cloud-to-IndexedDB hydration is explicit (`Sync for offline`) instead of running thousands of detail requests on every page load.

This split prevents two browsers signed into the same account from presenting different online libraries merely because their local caches are at different hydration stages.
