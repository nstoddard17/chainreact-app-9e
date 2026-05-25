import { InvalidSignatureError } from "@/core/triggers/errors";
import { verifyFacebookSignature } from "@/integrations/_shared/facebook/webhooks/signature";
import type { FacebookWebhookBody } from "./normalize";

/**
 * Facebook webhook receive helper — Slice 3.FACEBOOK-5.
 *
 * The global `/api/webhooks/facebook` route delegates here for the
 * security-sensitive part (signature verify + parse) so it's unit-testable
 * without a live request. Facebook's webhook is app-level — ONE URL serves
 * every Page/user, and the body carries the changed Page id(s) inline, so
 * there is no per-workflow signal in the URL.
 *
 * Flow (fail-closed — POST events are ALWAYS verified; the GET `hub.challenge`
 * handshake is handled in the route, not here):
 *   1. Secret present? → no → `MissingSecretError` (route 503; closes the
 *      V1 "processed unsigned" gap).
 *   2. `X-Hub-Signature-256` HMAC-SHA256 over the RAW body keyed with
 *      `FACEBOOK_CLIENT_SECRET`. Missing header / malformed / mismatch →
 *      `InvalidSignatureError` (route 401).
 *   3. Parse the verified body. Non-JSON despite a valid signature →
 *      `InvalidSignatureError` (malformed).
 *
 * Security: never echoes the secret, the raw body, the page/user tokens,
 * the appsecret_proof, post/comment text, or media URLs.
 */

export class MissingSecretError extends Error {
  constructor() {
    super(
      "Facebook webhook: FACEBOOK_CLIENT_SECRET env var is not set — refusing to accept unverifiable traffic.",
    );
    this.name = "MissingSecretError";
  }
}

const SIGNATURE_HEADER = "x-hub-signature-256";

export interface ReceiveFacebookWebhookInput {
  request: Request;
  /** Raw body — the receive ROUTE captures this BEFORE any parse. */
  rawBody: string;
}

export interface ReceiveFacebookWebhookResult {
  body: FacebookWebhookBody;
}

function getWebhookSecret(): string {
  const secret = process.env.FACEBOOK_CLIENT_SECRET;
  if (!secret) throw new MissingSecretError();
  return secret;
}

export function receiveFacebookWebhook(
  input: ReceiveFacebookWebhookInput,
): ReceiveFacebookWebhookResult {
  const { request, rawBody } = input;

  // 1. Secret present (fail-closed BEFORE looking at the header).
  const secret = getWebhookSecret();

  // 2. Signature verify over the raw body.
  const header = request.headers.get(SIGNATURE_HEADER);
  const verify = verifyFacebookSignature(rawBody, header, secret);
  if (!verify.valid) {
    throw new InvalidSignatureError(
      `Facebook webhook: signature verification failed (${verify.reason}).`,
    );
  }

  // 3. Parse the verified body.
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new InvalidSignatureError(
      "Facebook webhook: body is not valid JSON despite a verified signature.",
    );
  }

  return { body: (parsed ?? {}) as FacebookWebhookBody };
}
