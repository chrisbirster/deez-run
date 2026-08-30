# Hosted authentication

deez.run uses passwordless email magic links. The browser never stores an API token in JavaScript-accessible storage.

## Flow

1. `POST /api/v1/auth/magic-link` with an email address.
2. Deez normalizes the address, creates a cryptographically random 256-bit token, and stores only its SHA-256 hash.
3. The Zig backend posts only `{ "to", "magic_link" }` to the authenticated Deez email relay.
4. The relay renders the fixed Deez subject/body and sends through AWS SES from `Deez <login@auth.deez.run>`.
5. The GET page does not consume the token, so email security scanners cannot accidentally sign a user in.
6. The user presses Continue; the SPA posts the token to `/api/v1/auth/magic/consume`.
7. The Zig server consumes the single-use token and creates an opaque server-side session.
8. The browser receives `__Host-deez_session` with `Secure`, `HttpOnly`, `SameSite=Lax`, and `Path=/`.
9. New users choose a unique public username after their email is verified.

Magic links expire after 15 minutes. Sessions expire after seven days of inactivity and after thirty days absolutely. Active session cookies are periodically refreshed; all timeout decisions are enforced by the server.

## Email architecture

The production email path is deliberately provider-neutral from the Deez core's point of view:

```text
Deez Zig on Fly
    |
    | HTTPS POST /send-magic-link
    | Authorization: Bearer <relay token>
    | { to, magic_link }
    v
API Gateway + Lambda (SST)
    |
    | ses:SendEmail
    v
AWS SES (us-east-1)
    |
    v
Deez <login@auth.deez.run>
```

The Lambda is not a generic email relay. It accepts exactly `to` and `magic_link`, requires the link to be a canonical `https://deez.run/auth/magic?token=<64 hex>` URL, and owns the subject plus HTML/text templates. It does not accept arbitrary sender, subject, or body fields.

Infrastructure lives in [`infra/`](../infra/README.md). SST provisions the SES identity for `auth.deez.run`, DKIM, the custom `bounce.auth.deez.run` MAIL FROM domain, API Gateway, Lambda, IAM permissions, throttling, and Cloudflare DNS records.

## Production configuration

The hosted server requires MongoDB and these environment variables/secrets:

- `DEEZ_MONGO_URI` — MongoDB connection string.
- `DEEZ_AUTH_BASE_URL=https://deez.run` — canonical link origin. Do not derive magic-link origins from request `Host` headers.
- `DEEZ_EMAIL_ENDPOINT` — HTTPS URL returned by the SST stack, ending in `/send-magic-link`.
- `DEEZ_EMAIL_RELAY_TOKEN` — shared high-entropy bearer token configured both in SST and Fly.

`DEEZ_MONGO_URI` and `DEEZ_EMAIL_RELAY_TOKEN` are secrets. The endpoint itself is not a credential, but keeping the full hosted configuration in Fly avoids coupling the Zig binary to a particular AWS deployment.

There is no Resend dependency or Resend account requirement.

## Security properties

- Raw magic-link and session tokens are never stored in MongoDB; only their hashes are persisted.
- The relay bearer token, login token, full magic-link URL, and relay request body must never be logged.
- The relay treats all non-2xx SES/API outcomes as delivery failure.
- Magic-link request responses remain generic and do not reveal whether an email already has an account.
- Deez keeps per-email request throttling; API Gateway adds a second coarse throttle in front of the relay.
- The relay uses a linked SES resource, so its Lambda receives only the email-sending permissions required by the stack.

## Public vs personal data

Public catalog pages remain unauthenticated. Personal API routes resolve the session to a user and enforce deck ownership before returning or mutating notes, cards, reviews, study queues, or stats. Cross-account object probes return not-found rather than revealing resource existence.

Local loopback Deez remains account-free. Hosted authentication is enabled by the `deez serve --host 0.0.0.0` MongoDB runtime used by deez.run.
