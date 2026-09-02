# Local-first Deez browser

The browser application treats IndexedDB as its primary data store. Network access is replication, not the runtime data path.

## Data path

```text
SolidJS UI
   |
   v
local app API
   |
   v
IndexedDB  <---->  replication outbox/pull  <---->  deez.run HTTP API  <---->  MongoDB
```

Normal `/app` routes continue reading and writing the local database when the network is unavailable. There is no separate offline deck database.

## Rules

- Local mutations are committed to IndexedDB before network work begins.
- Each mutation has a durable outbox record in the same IndexedDB transaction.
- Reconnect replays the outbox and then refreshes the remote snapshot.
- Review replay preserves the original `reviewed_at_ms`.
- A `409` review retry is acknowledged only when immutable server history contains the exact rating/timestamp at the expected position.
- Remote edits are not overwritten when a local mutation was based on an older remote version; the outbox item becomes an explicit conflict.
- Logging out clears the local account database from that browser.
- Switching accounts is blocked while another account has pending local mutations.

## Current derived-state boundary

The first local-first slice caches rendered cards and FSRS previews from the Zig server. A card with an unsynchronized local review is temporarily withheld from another offline review. The follow-up WASM slice moves built-in card generation and FSRS replay/scheduling into the browser so repeated airplane-mode study uses the same Zig implementation as the CLI/server.

## Acceptance

The release gate is a real round trip:

```text
SQLite CLI -> deez sync -> deez.run -> IndexedDB -> airplane-mode review
-> reconnect/outbox replay -> deez.run -> deez sync -> SQLite CLI
```

The final local and hosted immutable review histories must match exactly.
