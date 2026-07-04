import type { TriggerEvent } from "@/contracts/triggerEvent";
import { InvalidSignatureError } from "@/core/triggers/errors";
import { decryptToken } from "@/core/encryption/tokens";
import * as triggerResourcesRepo from "@/repositories/triggerResources";
import { verifyCalendlySignature } from "@/integrations/_shared/calendly/webhooks/signature";
import { classifyCalendlyEvent, type CalendlyTriggerType } from "./eventMap";
import type { CalendlyWebhookEnvelope } from "./project";
import { normalizeEventScheduled } from "../eventScheduled/normalize";
import { normalizeEventCanceled } from "../eventCanceled/normalize";

/**
 * Shared receive helper for the Calendly webhook triggers — Slice
 * 5.CALENDLY-1.
 *
 * Single route at `/api/webhooks/calendly` handles both V2 Calendly
 * trigger types. Strict-direct-lookup: the URL carries
 * `?workflowId=X&nodeId=Y` (set at activation) so the trigger row
 * resolves without parsing the body first — Calendly deliveries carry
 * no subscription identifier in the body.
 *
 * ONE inbound shape (no creation handshake — V2 mints the signing key
 * and sends it in the subscription POST body, Typeform posture):
 *
 * **Event delivery.** `Calendly-Webhook-Signature` =
 * `t=<unix>,v1=<hex HMAC-SHA256 over "<t>.<raw body>">`, keyed with THAT
 * subscription's signing key (per-subscription — verification happens
 * AFTER row resolution; there is no missing-env failure mode):
 *   1. Resolve row via query params. Missing/foreign → quiet ack.
 *   2. Row without a stored secret (aborted activation) →
 *      `unverifiable` quiet ack — never dispatch what we can't verify.
 *   3. Verify signature over the RAW bytes (route captures them before
 *      any parse). Fail → InvalidSignatureError (route 401).
 *   4. Parse AFTER verification. Envelope `event` not a supported
 *      invitee event, or not the ROW's event (each subscription carries
 *      exactly one event, so a mismatch means a foreign/misrouted
 *      delivery) → `ignored_event` quiet ack (defense-in-depth, Asana
 *      eventMap posture).
 *   5. Normalize → one TriggerEvent. `subscriberUserId` attribution
 *      comes from the ROW's config (the subscription is user-scoped, so
 *      the row is the authoritative attribution — the delivery body
 *      does not carry the subscription owner).
 */

export type ReceiveResult =
  | { kind: "unknown_workflow" }
  | { kind: "unverifiable" }
  | { kind: "ignored_event"; eventType: string | null }
  | { kind: "events"; events: TriggerEvent[] };

const SIGNATURE_HEADER = "calendly-webhook-signature";

const NORMALIZERS: Readonly<
  Record<
    CalendlyTriggerType,
    (
      ev: CalendlyWebhookEnvelope,
      ctx: { subscriberUserId: string | null },
    ) => TriggerEvent
  >
> = Object.freeze({
  event_scheduled: normalizeEventScheduled,
  event_canceled: normalizeEventCanceled,
});

interface QueryDescriptor {
  workflowId: string;
  nodeId: string;
}

function parseQuery(url: string): QueryDescriptor | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const workflowId = parsed.searchParams.get("workflowId");
  const nodeId = parsed.searchParams.get("nodeId");
  if (!workflowId || !nodeId) return null;
  return { workflowId, nodeId };
}

export interface ReceiveCalendlyWebhookInput {
  request: Request;
  /** Raw body — the receive ROUTE captures this BEFORE any parse. */
  rawBody: string;
}

export async function receiveCalendlyWebhook(
  input: ReceiveCalendlyWebhookInput,
): Promise<ReceiveResult> {
  const { request, rawBody } = input;

  const query = parseQuery(request.url);
  if (!query) return { kind: "unknown_workflow" };

  const row = await triggerResourcesRepo.findByWorkflowAndNode(
    query.workflowId,
    query.nodeId,
  );
  if (!row || row.provider !== "calendly") {
    return { kind: "unknown_workflow" };
  }

  const config = row.config as {
    hookSecretEncrypted?: unknown;
    calendlyUserId?: unknown;
  };
  if (
    typeof config.hookSecretEncrypted !== "string" ||
    config.hookSecretEncrypted.length === 0
  ) {
    // Aborted activation left a secretless row — nothing deliverable to
    // this row can be verified, so nothing is dispatched.
    return { kind: "unverifiable" };
  }

  const secret = decryptToken(config.hookSecretEncrypted);
  const signatureHeader = request.headers.get(SIGNATURE_HEADER);
  const verifyResult = verifyCalendlySignature(rawBody, signatureHeader, secret);
  if (!verifyResult.valid) {
    throw new InvalidSignatureError(
      `Calendly webhook: signature verification failed (${verifyResult.reason}).`,
    );
  }

  // Parse AFTER verification — a verified non-JSON body is malformed.
  let parsedBody: CalendlyWebhookEnvelope;
  try {
    const candidate = JSON.parse(rawBody) as unknown;
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      throw new Error("not an object");
    }
    parsedBody = candidate as CalendlyWebhookEnvelope;
  } catch {
    throw new InvalidSignatureError(
      "Calendly webhook: body is not a JSON object despite a verified signature.",
    );
  }

  const inboundType = classifyCalendlyEvent(parsedBody.event);
  if (!inboundType || inboundType !== row.eventType) {
    // Unsupported event family, or an event that doesn't match the
    // row's own subscription (each subscription carries exactly one
    // event — defense-in-depth, never dispatch cross-type).
    return {
      kind: "ignored_event",
      eventType: typeof parsedBody.event === "string" ? parsedBody.event : null,
    };
  }

  const subscriberUserId =
    typeof config.calendlyUserId === "string" && config.calendlyUserId.length > 0
      ? config.calendlyUserId
      : null;

  return {
    kind: "events",
    events: [NORMALIZERS[inboundType](parsedBody, { subscriberUserId })],
  };
}
