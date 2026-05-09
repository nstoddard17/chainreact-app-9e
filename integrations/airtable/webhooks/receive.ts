import type { TriggerEvent } from "@/contracts/triggerEvent";
import { InvalidSignatureError } from "@/core/triggers/errors";
import * as triggerResourcesRepo from "@/repositories/triggerResources";
import { verifyAirtableSignature } from "@/integrations/_shared/airtable/webhooks/signature";
import { pull } from "../triggers/recordChanged/pull";

/**
 * Verify and parse an inbound Airtable webhook ping for the
 * `record_changed` trigger.
 *
 * Airtable's ping body shape per current docs (Slice 10 plan §"Six
 * confirmation answers" #4):
 *   `{ base: { id }, webhook: { id }, timestamp }`
 * — NO record-change data in the notification. V2 must fetch via
 * cursor-paged `webhooksListPayloads` to retrieve the actual changes.
 *
 * Two-step verification:
 *   1. Look up the trigger row by `webhook.id`. The route MUST
 *      capture the raw body BEFORE any JSON parsing — the signature
 *      is computed over those bytes. The receive helper signature
 *      already takes `rawBody`.
 *   2. Verify `X-Airtable-Content-MAC: hmac-sha256=<hex>` against the
 *      stored `macSecretBase64` via constant-time HMAC compare.
 *      Mismatch → throw InvalidSignatureError; the route maps to 401.
 *
 * Outcomes:
 *   - `unknown_webhook`: webhookId not in trigger_resources. Quietly
 *     200 — Airtable may still deliver pings for a webhook that was
 *     deleted (in-flight window after deactivate). Avoids noisy
 *     retries during normal lifecycle.
 *   - `events`: signature verified + payloads pulled + normalized.
 *
 * Throws:
 *   - `InvalidSignatureError` for malformed bodies (not parseable JSON
 *     OR missing required `webhook.id`), missing signature header, or
 *     signature mismatch. The route maps to 401.
 */

export type ReceiveResult =
  | { kind: "unknown_webhook" }
  | { kind: "events"; events: TriggerEvent[] };

interface AirtablePingBody {
  base?: { id?: string };
  webhook?: { id?: string };
  timestamp?: string;
}

const SIGNATURE_HEADER = "x-airtable-content-mac";

export async function receiveAirtableWebhook(
  request: Request,
): Promise<ReceiveResult> {
  // 1. Read raw body BEFORE parse — signature is over these bytes.
  const rawBody = await request.text();
  if (!rawBody.trim()) {
    throw new InvalidSignatureError("Airtable webhook: empty body.");
  }

  // 2. Parse body. Malformed JSON is a spoof signal (Airtable always
  //    sends well-formed JSON for ping bodies).
  let body: AirtablePingBody;
  try {
    body = JSON.parse(rawBody) as AirtablePingBody;
  } catch {
    throw new InvalidSignatureError("Airtable webhook: body is not valid JSON.");
  }

  const baseId = body.base?.id;
  const webhookId = body.webhook?.id;
  if (!baseId || !webhookId) {
    throw new InvalidSignatureError(
      "Airtable webhook: ping body missing base.id or webhook.id.",
    );
  }

  // 3. Look up the trigger row by webhookId. Quietly 200 on misses
  //    (in-flight window after deactivate; matches Microsoft / Google
  //    pattern).
  const matches = await triggerResourcesRepo.listByConfigContains({
    webhookId,
  });
  if (matches.length === 0) {
    return { kind: "unknown_webhook" };
  }
  const trigger = matches[0]!;

  // 4. Signature verification. Required.
  const config = trigger.config as { macSecretBase64?: string };
  const macSecretBase64 = config.macSecretBase64;
  if (!macSecretBase64) {
    // Trigger row exists but never persisted the MAC secret — corrupt
    // state. Treat as a signature failure (loud) rather than silently
    // accepting unsigned events.
    throw new InvalidSignatureError(
      "Airtable webhook: trigger row missing macSecretBase64.",
    );
  }

  const signatureHeader = request.headers.get(SIGNATURE_HEADER);
  if (!signatureHeader) {
    throw new InvalidSignatureError(
      "Airtable webhook: X-Airtable-Content-MAC header missing.",
    );
  }

  if (!verifyAirtableSignature(rawBody, signatureHeader, macSecretBase64)) {
    throw new InvalidSignatureError(
      "Airtable webhook: signature mismatch.",
    );
  }

  // 5. Pull payloads via cursor + normalize. `pull` advances the
  //    cursor BEFORE returning so a downstream dispatch failure
  //    doesn't replay events on the next ping.
  const occurredAt = body.timestamp ?? new Date().toISOString();
  const result = await pull(trigger, occurredAt);
  return { kind: "events", events: result.events };
}
