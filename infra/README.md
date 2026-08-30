# deez.run email relay infrastructure

This SST project provisions the production magic-link email path for deez.run in `us-east-1`.

Production endpoint:

```text
https://email.deez.run/send-magic-link
```

## What this stack creates

- SES domain identity for `auth.deez.run`
- Cloudflare verification and DKIM records managed by SST's Email component
- DMARC for the `auth.deez.run` sending subdomain
- custom MAIL FROM domain `bounce.auth.deez.run` with MX/SPF records
- API Gateway HTTP API exposed at `email.deez.run`
- `POST /send-magic-link` Lambda route
- identity-scoped IAM permission containing only `ses:SendEmail`
- `EmailRelayToken` SST secret
- API Gateway throttling

The Lambda accepts only:

```json
{
  "to": "person@example.com",
  "magic_link": "https://deez.run/auth/magic?token=<64-hex-token>"
}
```

It owns the sender, subject, text body, and HTML body. It cannot be used as a general-purpose arbitrary email relay. Successful SES acceptance returns HTTP `202`; every other response status represents failure to the Deez client.

## Runtime contract

Deez on Fly reads the relay configuration from:

- `DEEZ_EMAIL_ENDPOINT`
- `DEEZ_EMAIL_RELAY_TOKEN`

The production endpoint value is:

```bash
DEEZ_EMAIL_ENDPOINT='https://email.deez.run/send-magic-link'
```

Requests use:

```http
POST https://email.deez.run/send-magic-link
Authorization: Bearer <DEEZ_EMAIL_RELAY_TOKEN>
Content-Type: application/json

{
  "to": "person@example.com",
  "magic_link": "https://deez.run/auth/magic?token=<secret>"
}
```

The authorization header, request body, bearer token, login token, and full magic link must never be logged.

## Prerequisites

For a new environment or disaster recovery deployment:

- AWS account credentials that can deploy SST resources in `us-east-1`
- Cloudflare API token scoped to DNS edit for the `deez.run` zone
- Cloudflare account ID available to the provider
- AWS SES production access before sending to arbitrary unverified recipients

SST reads provider credentials from the environment. Do not commit them.

Typical Cloudflare environment variables:

```bash
export CLOUDFLARE_API_TOKEN='...'
export CLOUDFLARE_DEFAULT_ACCOUNT_ID='...'
```

Configure AWS credentials using your normal AWS profile or CI identity.

## Install and verify

```bash
cd infra
npm install
npm run check
```

`npm run check` installs SST's pinned provider packages and typechecks the Lambda code owned by this repository. A credentialed `sst deploy` performs synthesis and deployment validation for the AWS and Cloudflare resources.

## Relay secret

Generate a high-entropy token for a new deployment and store it in SST. Do not reuse a personal password or API key.

```bash
cd infra
RELAY_TOKEN="$(openssl rand -hex 32)"
npx sst secret set EmailRelayToken "$RELAY_TOKEN" --stage production
```

Use the same value as the Fly `DEEZ_EMAIL_RELAY_TOKEN` secret. Do not print it into logs or commit it.

## Deploy

```bash
cd infra
npm run deploy:production
```

Configure Fly with the production endpoint and matching relay token:

```bash
fly secrets set \
  DEEZ_EMAIL_ENDPOINT='https://email.deez.run/send-magic-link' \
  DEEZ_EMAIL_RELAY_TOKEN='<same high-entropy token>' \
  -a deez-run
```

`DEEZ_AUTH_BASE_URL=https://deez.run` is non-secret Fly configuration. `DEEZ_MONGO_URI` is configured separately as a Fly secret.

## Security notes

- API Gateway access logs are enabled, but request bodies are not included.
- The Lambda never logs the recipient, authorization header, bearer token, login token, request body, or full magic link.
- The shared bearer secret is checked before parsing/sending.
- The Lambda rejects payloads with fields other than `to` and `magic_link`.
- Magic links must use the exact `https://deez.run/auth/magic?token=<64 hex>` shape.
- The Lambda returns `202` only after SES accepts the send request.
- The Lambda receives `ses:SendEmail` only, scoped to the `auth.deez.run` SES identity ARN; it is not granted raw-email or templated-email actions.
- The `auth.deez.run` SES identity is isolated from existing apex `deez.run` inbound email configuration.
- Do not alter existing apex MX or DMARC records as part of this deployment.
