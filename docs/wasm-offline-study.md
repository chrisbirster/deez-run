# Shared Zig/WASM offline study

`deez.run` uses the Deez core `deez-scheduler.wasm` artifact for offline FSRS scheduling. The browser does not carry an independent TypeScript scheduler implementation.

## Boundary

The WebAssembly module is intentionally pure and storage/network-free. IndexedDB owns local persistence and the replication outbox; Zig/WASM owns FSRS replay and candidate scheduling from immutable review history plus the deck's resolved parameter set.

The PWA caches `/deez-scheduler.wasm` with the application shell. After one successful online prime, study preview and repeated reviews can continue without network access. Each local review keeps its original `reviewed_at_ms` and expected history index so reconnect replay is deterministic and idempotent.

## Production gate

The production Docker image must contain `/app/web/deez-scheduler.wasm`. CI extracts the compiled artifact from the image, instantiates it with the JavaScript WebAssembly runtime, verifies the expected exports, performs an initial schedule, appends a review, performs a second offline schedule, then confirms the same artifact is served by the Zig HTTP server and referenced by the service worker.

The Dockerfile and CI workflow pin a full immutable Deez core commit. Production deployment must not use an integration branch or floating ref.
