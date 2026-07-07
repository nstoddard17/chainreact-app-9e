import { createHmac, timingSafeEqual } from "node:crypto";
import { InvalidSignatureError } from "@/core/triggers/errors";

/**
 * QuickBooks app-level webhook receive — QUICKBOOKS-1.
 *
 * Verify + parse ONLY (per docs/rules/webhook-receipt-routes.md the
 * receive module owns signature verification, payload parsing, and
 * batch unwrapping; enrichment/dispatch live in enrich.ts).
 *
 * Signature (research.md §Webhooks): header `intuit-signature` carries
 * the BASE64-encoded HMAC-SHA256 of the raw request body, keyed with
 * the app's verifier token (shown in the Intuit portal after saving the
 * webhook endpoint; separate token per environment →
 * `QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN`). No timestamp component — replay
 * protection is the dispatcher's idempotency dedup. Comparison is
 * constant-time over the raw digest bytes.
 *
 *   - Missing env token → `MissingSecretError` (route → 503,
 *     fail-closed — never accept unsigned deliveries; Dropbox
 *     precedent).
 *   - Missing / malformed / mismatched header → `InvalidSignatureError`
 *     (route → 401). The signature value itself is never logged.
 *
 * Payload (compact by design — no entity data): eventNotifications[]
 * of { realmId, dataChangeEvent.entities[] of { name, id, operation,
 * lastUpdated } }, multiple realms per POST possible. Parsed into flat
 * per-entity tuples; unsupported shapes are skipped (count returned)
 * rather than failing the whole delivery.
 */

export class MissingSecretError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MissingSecretError";
  }
}

/** One compact Intuit entity event, flattened for enrichment. */
export interface QuickbooksEntityEvent {
  realmId: string;
  /** Intuit entity name, e.g. "Customer" | "Invoice" | "Payment". */
  entity: string;
  /** Intuit operation, e.g. "Create" | "Update" | "Delete" | "Void" | "Merge". */
  operation: string;
  entityId: string;
  /** Intuit's lastUpdated timestamp for the change (ISO 8601), if present. */
  lastUpdated: string | null;
}

export interface QuickbooksReceiveResult {
  events: QuickbooksEntityEvent[];
  /** Entity entries skipped for missing realm/name/id/operation. */
  malformedSkipped: number;
}

function verifySignature(rawBody: string, header: string | null): void {
  const verifier = process.env.QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN;
  if (!verifier) {
    throw new MissingSecretError(
      "QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN env var is not set.",
    );
  }
  if (typeof header !== "string" || header.length === 0) {
    throw new InvalidSignatureError("quickbooks webhook: missing signature header");
  }

  const expected = createHmac("sha256", verifier)
    .update(rawBody, "utf8")
    .digest();

  let provided: Buffer;
  try {
    provided = Buffer.from(header, "base64");
  } catch {
    throw new InvalidSignatureError("quickbooks webhook: malformed signature header");
  }
  if (
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  ) {
    throw new InvalidSignatureError("quickbooks webhook: signature mismatch");
  }
}

interface RawEntity {
  name?: unknown;
  id?: unknown;
  operation?: unknown;
  lastUpdated?: unknown;
}

interface RawNotification {
  realmId?: unknown;
  dataChangeEvent?: { entities?: unknown } | null;
}

export function receiveQuickbooksWebhook(input: {
  request: Request;
  rawBody: string;
}): QuickbooksReceiveResult {
  verifySignature(
    input.rawBody,
    input.request.headers.get("intuit-signature"),
  );

  let parsed: { eventNotifications?: unknown };
  try {
    parsed = JSON.parse(input.rawBody) as { eventNotifications?: unknown };
  } catch {
    throw new Error("quickbooks webhook: body is not valid JSON.");
  }

  const notifications = Array.isArray(parsed.eventNotifications)
    ? (parsed.eventNotifications as RawNotification[])
    : [];

  const events: QuickbooksEntityEvent[] = [];
  let malformedSkipped = 0;

  for (const notification of notifications) {
    const realmId =
      typeof notification.realmId === "string" && notification.realmId.length > 0
        ? notification.realmId
        : null;
    const entities = Array.isArray(notification.dataChangeEvent?.entities)
      ? (notification.dataChangeEvent?.entities as RawEntity[])
      : [];
    if (!realmId) {
      malformedSkipped += entities.length > 0 ? entities.length : 1;
      continue;
    }
    for (const entity of entities) {
      const name =
        typeof entity.name === "string" && entity.name.length > 0
          ? entity.name
          : null;
      const id =
        typeof entity.id === "string" && entity.id.length > 0
          ? entity.id
          : null;
      const operation =
        typeof entity.operation === "string" && entity.operation.length > 0
          ? entity.operation
          : null;
      if (!name || !id || !operation) {
        malformedSkipped += 1;
        continue;
      }
      events.push({
        realmId,
        entity: name,
        operation,
        entityId: id,
        lastUpdated:
          typeof entity.lastUpdated === "string" && entity.lastUpdated.length > 0
            ? entity.lastUpdated
            : null,
      });
    }
  }

  return { events, malformedSkipped };
}
