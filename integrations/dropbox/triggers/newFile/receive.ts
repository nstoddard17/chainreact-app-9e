import { InvalidSignatureError } from "@/core/triggers/errors";
import { verifyDropboxSignature } from "@/integrations/_shared/dropbox/webhooks/signature";

/**
 * Dropbox webhook receive helper — Slice 3.DROPBOX-5.
 *
 * The global `/api/webhooks/dropbox` route delegates here for the
 * security-sensitive part (signature verify + account extraction) so it's
 * unit-testable without a live request. Unlike Monday's strict-direct
 * lookup (`?workflowId=&nodeId=`), Dropbox's notification body carries
 * ONLY changed-account ids — there is no per-workflow signal in the URL or
 * body. The route hands the account ids to the reconciler.
 *
 * Flow (fail-closed — Dropbox events are ALWAYS verified, no challenge
 * exemption on POST; the GET `?challenge` handshake is handled in the
 * route, not here):
 *   1. Secret present? → no → `MissingSecretError` (route 503; closes the
 *      V1 "dev mode accepted unsigned" gap).
 *   2. `X-Dropbox-Signature` HMAC-SHA256-hex over the RAW body keyed with
 *      `DROPBOX_CLIENT_SECRET`. Missing header / malformed / mismatch →
 *      `InvalidSignatureError` (route 401).
 *   3. Parse `{ list_folder: { accounts: [account_id…] } }` → de-duped
 *      account ids. A verified-but-non-JSON body is malformed
 *      (`InvalidSignatureError`). A verified body with no accounts → empty
 *      list (route acks 200, reconciler is a no-op).
 *
 * Security: never echoes the secret, the raw body, account tokens, paths,
 * file bytes, or links.
 */

export class MissingSecretError extends Error {
  constructor() {
    super(
      "Dropbox webhook: DROPBOX_CLIENT_SECRET env var is not set — refusing to accept unverifiable traffic.",
    );
    this.name = "MissingSecretError";
  }
}

const SIGNATURE_HEADER = "x-dropbox-signature";

export interface ReceiveDropboxWebhookInput {
  request: Request;
  /** Raw body — the receive ROUTE captures this BEFORE any parse. */
  rawBody: string;
}

export interface ReceiveDropboxWebhookResult {
  /** De-duped Dropbox `account_id`s (`dbid:…`) that changed. */
  accountIds: string[];
}

function getWebhookSecret(): string {
  const secret = process.env.DROPBOX_CLIENT_SECRET;
  if (!secret) throw new MissingSecretError();
  return secret;
}

function extractAccountIds(body: unknown): string[] {
  if (!body || typeof body !== "object") return [];
  const listFolder = (body as { list_folder?: unknown }).list_folder;
  if (!listFolder || typeof listFolder !== "object") return [];
  const accounts = (listFolder as { accounts?: unknown }).accounts;
  if (!Array.isArray(accounts)) return [];
  const out: string[] = [];
  for (const a of accounts) {
    if (typeof a === "string" && a.length > 0) out.push(a);
  }
  return Array.from(new Set(out));
}

export function receiveDropboxWebhook(
  input: ReceiveDropboxWebhookInput,
): ReceiveDropboxWebhookResult {
  const { request, rawBody } = input;

  // 1. Secret present (fail-closed BEFORE looking at the header).
  const secret = getWebhookSecret();

  // 2. Signature verify over the raw body.
  const header = request.headers.get(SIGNATURE_HEADER);
  const verify = verifyDropboxSignature(rawBody, header, secret);
  if (!verify.valid) {
    throw new InvalidSignatureError(
      `Dropbox webhook: signature verification failed (${verify.reason}).`,
    );
  }

  // 3. Parse the verified body for changed accounts.
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new InvalidSignatureError(
      "Dropbox webhook: body is not valid JSON despite a verified signature.",
    );
  }

  return { accountIds: extractAccountIds(parsed) };
}
