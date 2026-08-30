# deez.run email relay infrastructure

This SST project provisions the production magic-link email path for deez.run in `us-east-1`.

It uses AWS SES for delivery and Cloudflare only for DNS management. It does **not** require Resend.

## What this stack creates

- SES domain identity for `auth.deez.run`
- DKIM records in Cloudflare DNS
- DMARC for the `auth.deez.run` sending subdomain
- custom MAIL FROM domain `bounce.auth.deez.run` with MX/SPF records
- API Gateway HTTP API
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

It owns the sender, subject, text body, and HTML body. It cannot be used as a general-purpose arbitrary email relay.

## Prerequisites

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

## Install

```bash
cd infra
npm install
npm run check
```

`npm run check` installs SST's pinned provider packages and typechecks the Lambda code owned by this repository. The first real `sst deploy` is the credentialed synthesis/deployment check for the AWS and Cloudflare resources.

## Create the relay secret

Generate a high-entropy token and store it in SST. Do not reuse a personal password or API key.

```bash
cd infra
RELAY_TOKEN="$(openssl rand -hex 32)"
npx sst secret set EmailRelayToken "$RELAY_TOKEN" --stage production
```

Keep the same value available long enough to add it to Fly as `DEEZ_EMAIL_RELAY_TOKEN`. Do not print it into logs or commit it.

## Deploy

```bash
cd infra
npm run deploy:production
```

The stack outputs `emailRelayEndpoint`. Configure Fly with that URL and the same relay token:

```bash
fly secrets set \
  DEEZ_EMAIL_ENDPOINT='https://<api-id>.execute-api.us-east-1.amazonaws.com/send-magic-link' \
  DEEZ_EMAIL_RELAY_TOKEN='<same high-entropy token>' \
  DEEZ_AUTH_BASE_URL='https://deez.run' \
  -a deez-run
```

`DEEZ_MONGO_URI` is configured separately as a Fly secret.

## SES production access

New SES accounts begin in the sandbox. Domain verification alone does not remove the sandbox restriction. Request SES production access for `us-east-1` before treating hosted authentication as production-ready.

After production access is granted, verify a real magic-link email reaches Gmail and inspect the received headers for SPF, DKIM, and DMARC alignment.

## Security notes

- API Gateway access logs are enabled, but request bodies are not included.
- The Lambda never logs the recipient, bearer token, login token, request body, or full magic link.
- The shared bearer secret is checked before parsing/sending.
- The Lambda rejects payloads with fields other than `to` and `magic_link`.
- Magic links must use the exact `https://deez.run/auth/magic?token=<64 hex>` shape.
- The Lambda receives `ses:SendEmail` only, scoped to the `auth.deez.run` SES identity ARN; it is not granted raw-email or templated-email actions.
- The `auth.deez.run` SES identity is isolated from existing apex `deez.run` inbound email configuration.
- Do not alter existing apex MX or DMARC records as part of this deployment.
