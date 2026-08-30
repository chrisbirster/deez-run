# Hosted authentication

deez.run uses passwordless email magic links. The browser never stores an API token in JavaScript-accessible storage.

## Flow

1. `POST /api/v1/auth/magic-link` with an email address.
2. Deez normalizes the address, creates a cryptographically random 256-bit token, and stores only its SHA-256 hash.
3. Resend sends a link to `DEEZ_AUTH_BASE_URL/auth/magic?token=...`.
4. The GET page does not consume the token, so email security scanners cannot accidentally sign a user in.
5. The user presses Continue; the SPA posts the token to `/api/v1/auth/magic/consume`.
6. The Zig server consumes the single-use token and creates an opaque server-side session.
7. The browser receives `__Host-deez_session` with `Secure`, `HttpOnly`, `SameSite=Lax`, and `Path=/`.
8. New users choose a unique public username after their email is verified.

Magic links expire after 15 minutes. Sessions expire after seven days of inactivity and after thirty days absolutely. Active session cookies are periodically refreshed; all timeout decisions are enforced by the server.

## Production configuration

The hosted server requires MongoDB and these environment variables/secrets:

- `DEEZ_MONGO_URI` — MongoDB connection string.
- `DEEZ_AUTH_BASE_URL=https://deez.run` — canonical link origin. Do not derive magic-link origins from request `Host` headers.
- `DEEZ_RESEND_API_KEY` — restricted Resend API key with permission to send authentication email.
- `DEEZ_AUTH_FROM` — verified sender identity, for example `Deez <login@auth.deez.run>`.

Secrets belong in Fly secrets and must not be committed to this repository or embedded into the frontend build.

## Public vs personal data

Public catalog pages remain unauthenticated. Personal API routes resolve the session to a user and enforce deck ownership before returning or mutating notes, cards, reviews, study queues, or stats. Cross-account object probes return not-found rather than revealing resource existence.

Local loopback Deez remains account-free. Hosted authentication is enabled by the `deez serve --host 0.0.0.0` MongoDB runtime used by deez.run.
