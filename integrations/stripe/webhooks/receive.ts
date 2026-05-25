import type { TriggerEvent } from "@/contracts/triggerEvent";
import {
  InvalidSignatureError,
  SignatureExpiredError,
} from "@/core/triggers/errors";
import * as triggerResourcesRepo from "@/repositories/triggerResources";
import { verifyStripeSignature } from "@/integrations/_shared/stripe/webhooks/signature";
import { isAllowedStripeEventType } from "../triggers/eventReceived/allowedEventTypes";
import {
  normalizeStripeEvent,
  type StripeEvent,
} from "../triggers/eventReceived/normalize";

/**
 * Verify and parse an inbound Stripe webhook event for the
 * `event_received` trigger — Slice 11 Commit 4.
 *
 * Strict-direct-lookup pattern (per Slice 11 plan §16):
 *   - Reads `workflowId` + `nodeId` from URL query params (set at
 *     activation time on the notification URL).
 *   - Calls `findByWorkflowAndNode` (service-role) to get the single
 *     trigger_resources row for this trigger.
 *   - Verifies `Stripe-Signature` against THAT row's stored
 *     `endpointSecret` — NO multi-secret fallback. (V1's
 *     `app/api/webhooks/stripe-integration/route.ts:175-228` tries
 *     every active secret; V2 explicitly rejects that pattern.)
 *
 * Outcomes:
 *   - `unknown_workflow`: workflowId / nodeId query params missing
 *     OR no matching trigger row. The route maps to a 200 quiet ack —
 *     in-flight events for a deleted endpoint shouldn't trigger
 *     Stripe's 24-hour retry storm.
 *   - `unsupported_event_type`: signature OK + trigger found, but
 *     Stripe sent an event type outside the Slice 11 allowlist (e.g.
 *     dashboard re-config subscribed extra events). Route 200-acks
 *     without dispatch — the event-type filter is defense-in-depth
 *     against out-of-band Stripe configuration drift.
 *   - `events`: signature verified + event normalized. Route
 *     dispatches.
 *
 * Throws (route maps to 401):
 *   - `SignatureExpiredError` for timestamp-outside-tolerance
 *     (subclass of InvalidSignatureError; logged distinctly for
 *     diagnostics).
 *   - `InvalidSignatureError` for missing header / malformed header
 *     / no-v1 / signature mismatch.
 *
 * Throws (route maps to 500):
 *   - any unexpected error from JSON parse / repo lookup.
 */

export type ReceiveResult =
  | { kind: "unknown_workflow" }
  | { kind: "unsupported_event_type"; stripeEventType: string }
  | { kind: "events"; events: TriggerEvent[] };

const SIGNATURE_HEADER = "stripe-signature";

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

export async function receiveStripeWebhook(
  request: Request,
): Promise<ReceiveResult> {
  // 1. Parse strict-direct-lookup query params. Missing → quietly
  //    200 (in-flight ack — see file header).
  const query = parseQuery(request.url);
  if (!query) return { kind: "unknown_workflow" };

  // 2. Read raw body BEFORE parse — signature is over these bytes.
  const rawBody = await request.text();
  if (!rawBody.trim()) {
    throw new InvalidSignatureError("Stripe webhook: empty body.");
  }

  // 3. Look up the trigger row. Filter to provider=stripe and
  //    event_type=event_received as defense-in-depth (the unique
  //    index on (workflow_id, node_id) means the row is already
  //    unambiguous, but mismatched provider/eventType would mean a
  //    misrouted webhook URL).
  const trigger = await triggerResourcesRepo.findByWorkflowAndNode(
    query.workflowId,
    query.nodeId,
  );
  if (
    !trigger ||
    trigger.provider !== "stripe" ||
    trigger.eventType !== "event_received"
  ) {
    return { kind: "unknown_workflow" };
  }

  // 4. Signature verification. Required.
  const config = trigger.config as { endpointSecret?: string };
  const endpointSecret = config.endpointSecret;
  if (!endpointSecret) {
    // Trigger row exists but never persisted the signing secret —
    // corrupt state. Treat as a signature failure (loud) rather
    // than silently accepting unsigned events.
    throw new InvalidSignatureError(
      "Stripe webhook: trigger row missing endpointSecret.",
    );
  }

  const signatureHeader = request.headers.get(SIGNATURE_HEADER);
  const verifyResult = verifyStripeSignature(
    rawBody,
    signatureHeader,
    endpointSecret,
  );
  if (!verifyResult.valid) {
    if (verifyResult.reason === "expired") {
      throw new SignatureExpiredError(
        "Stripe webhook: signature timestamp outside the 300s replay tolerance window.",
      );
    }
    throw new InvalidSignatureError(
      `Stripe webhook: signature verification failed (${verifyResult.reason}).`,
    );
  }

  // 5. Parse JSON body. Stripe always sends well-formed JSON; a
  //    parse error after a successful signature verify means
  //    something downstream re-encoded the body — fail loud.
  let event: StripeEvent;
  try {
    event = JSON.parse(rawBody) as StripeEvent;
  } catch {
    throw new InvalidSignatureError(
      "Stripe webhook: body is not valid JSON despite a verified signature.",
    );
  }

  if (!event.id || !event.type) {
    throw new InvalidSignatureError(
      "Stripe webhook: parsed event missing id or type.",
    );
  }

  // 6. Allowlist filter — defense-in-depth against dashboard
  //    re-config subscribing the endpoint to non-allowlisted events.
  if (!isAllowedStripeEventType(event.type)) {
    return { kind: "unsupported_event_type", stripeEventType: event.type };
  }

  // 7. Normalize to canonical TriggerEvent.
  const normalized = normalizeStripeEvent(event);
  return { kind: "events", events: [normalized] };
}
