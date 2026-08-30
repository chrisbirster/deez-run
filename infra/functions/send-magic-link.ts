import { timingSafeEqual } from "node:crypto";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { Resource } from "sst";

const ses = new SESv2Client({ region: "us-east-1" });
const fromAddress = "Deez <login@auth.deez.run>";
const magicLinkPattern = /^https:\/\/deez\.run\/auth\/magic\?token=[0-9a-fA-F]{64}$/;

type Payload = {
  to: string;
  magic_link: string;
};

function response(statusCode: number): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json",
    },
    body: statusCode === 204 ? undefined : JSON.stringify({ ok: false }),
  };
}

function authorized(value: string | undefined): boolean {
  if (!value?.startsWith("Bearer ")) return false;
  const provided = Buffer.from(value.slice("Bearer ".length), "utf8");
  const expected = Buffer.from(Resource.EmailRelayToken.value, "utf8");
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

function validEmail(value: unknown): value is string {
  if (typeof value !== "string" || value.length < 3 || value.length > 254) return false;
  if (/[^\x21-\x7e]/.test(value) || value.includes('"') || value.includes("\\")) return false;
  const at = value.indexOf("@");
  if (at <= 0 || at !== value.lastIndexOf("@") || at === value.length - 1) return false;
  return value.slice(at + 1).includes(".");
}

function parsePayload(body: string | undefined): Payload | undefined {
  if (!body || body.length > 4096) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    return undefined;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.length !== 2 || keys[0] !== "magic_link" || keys[1] !== "to") return undefined;
  if (!validEmail(record.to)) return undefined;
  if (typeof record.magic_link !== "string" || !magicLinkPattern.test(record.magic_link)) return undefined;
  return { to: record.to, magic_link: record.magic_link };
}

function textBody(magicLink: string): string {
  return [
    "Sign in to Deez",
    "",
    "Use this one-time link to continue:",
    magicLink,
    "",
    "This link expires in 15 minutes. If you did not request it, you can ignore this email.",
  ].join("\n");
}

function htmlBody(magicLink: string): string {
  return `<!doctype html>
<html>
  <body style="font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#171712;background:#fffdf7;padding:32px">
    <main style="max-width:560px;margin:0 auto">
      <h1 style="font-size:28px;margin:0 0 16px">Sign in to Deez</h1>
      <p style="line-height:1.6">Use this one-time link to continue:</p>
      <p style="margin:28px 0"><a href="${magicLink}" style="display:inline-block;background:#315f45;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700">Continue to Deez</a></p>
      <p style="color:#6f6b60;line-height:1.6">This link expires in 15 minutes. If you did not request it, you can ignore this email.</p>
    </main>
  </body>
</html>`;
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> {
  if (!authorized(event.headers.authorization)) return response(401);
  if (event.requestContext.http.method !== "POST") return response(405);

  const payload = parsePayload(event.body);
  if (!payload) return response(400);

  try {
    await ses.send(new SendEmailCommand({
      FromEmailAddress: fromAddress,
      Destination: { ToAddresses: [payload.to] },
      Content: {
        Simple: {
          Subject: { Data: "Sign in to Deez", Charset: "UTF-8" },
          Body: {
            Text: { Data: textBody(payload.magic_link), Charset: "UTF-8" },
            Html: { Data: htmlBody(payload.magic_link), Charset: "UTF-8" },
          },
        },
      },
    }));
  } catch (error) {
    // Never log the recipient, request body, bearer token, login token, or link.
    const name = error instanceof Error ? error.name : "UnknownError";
    console.error("SES magic-link delivery failed", { name });
    return response(502);
  }

  return response(204);
}
