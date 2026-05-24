import type { TriggerEvent } from "@/contracts/triggerEvent";
import { InvalidSignatureError } from "@/core/triggers/errors";
import * as triggerResourcesRepo from "@/repositories/triggerResources";
import { verifyMondaySignature } from "@/integrations/_shared/monday/webhooks/signature";
import { classifyMondayEvent, type MondayTriggerType } from "./eventMap";
import { getEventObject, type MondayEventObject } from "./fields";
import { normalizeNewItem } from "../newItem/normalize";
import { normalizeColumnChanged } from "../columnChanged/normalize";
import { normalizeItemMoved } from "../itemMoved/normalize";
import { normalizeNewSubitem } from "../newSubitem/normalize";
import { normalizeNewUpdate } from "../newUpdate/normalize";

/**
 * Shared receive helper for Monday board webhooks — Slice 3.MONDAY-7.
 *
 * Single route at `/api/webhooks/monday` handles all 5 V2 Monday trigger
 * types. Strict-direct-lookup pattern (same as GitHub / Shopify / Stripe
 * / Trello): the URL carries `?workflowId=X&nodeId=Y` (set at activation
 * time) so the trigger row resolves without parsing the body first.
 *
 * Flow:
 *   1. Parse JSON body defensively.
 *   2. **Challenge handshake** — if the body has a top-level `challenge`
 *      string, echo it back IMMEDIATELY, BEFORE signature verification.
 *      Monday sends this on `create_webhook` to verify endpoint
 *      ownership; the challenge carries no event data and echoing the
 *      token Monday just sent leaks nothing. Gating it on the signature
 *      would risk breaking webhook creation (Monday's challenge POST is
 *      not reliably signed). Real EVENTS are always fail-closed (step 3).
 *   3. **Signature verify** (events only) — `x-monday-signature`
 *      HMAC-SHA256 over the raw body keyed by `MONDAY_SIGNING_SECRET`.
 *      Missing secret → `MissingSecretError` (route 503, server
 *      misconfig — V1 silently SKIPPED verification when unset). Missing
 *      header / malformed / mismatch → `InvalidSignatureError` (route
 *      401).
 *   4. Strict-direct-lookup query params. Missing → 200 quiet ack.
 *   5. `findByWorkflowAndNode`. Missing row / not-monday → 200 ack.
 *   6. Classify inbound `event.type` → V2 trigger type. Unknown → 200 ack
 *      (`unsupported_event`).
 *   7. Per-trigger event-type filter: the classified type MUST equal the
 *      trigger row's `eventType`. Mismatch → 200 ack
 *      (`event_type_mismatch`) — defense-in-depth so a board webhook for
 *      one event type can't fire a different trigger node.
 *   8. Normalize via the per-type normalizer → dispatch.
 *
 * The raw body MUST be captured by the ROUTE before any parse — the HMAC
 * is over those exact bytes.
 */

export class MissingSecretError extends Error {
  constructor() {
    super(
      "Monday webhook: MONDAY_SIGNING_SECRET env var is not set — refusing to accept unsigned-equivalent traffic.",
    );
    this.name = "MissingSecretError";
  }
}

export type ReceiveResult =
  | { kind: "challenge"; challenge: string }
  | { kind: "unknown_workflow" }
  | { kind: "unsupported_event"; eventType: string | null }
  | {
      kind: "event_type_mismatch";
      triggerEventType: string;
      inboundType: MondayTriggerType;
    }
  | { kind: "events"; events: TriggerEvent[] };

const SIGNATURE_HEADER = "x-monday-signature";

const NORMALIZERS: Readonly<
  Record<MondayTriggerType, (ev: MondayEventObject) => TriggerEvent>
> = Object.freeze({
  new_item: normalizeNewItem,
  column_changed: normalizeColumnChanged,
  item_moved: normalizeItemMoved,
  new_subitem: normalizeNewSubitem,
  new_update: normalizeNewUpdate,
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

function getWebhookSecret(): string {
  const secret = process.env.MONDAY_SIGNING_SECRET;
  if (!secret) throw new MissingSecretError();
  return secret;
}

export interface ReceiveMondayWebhookInput {
  request: Request;
  /** Raw body — the receive ROUTE captures this BEFORE any parse. */
  rawBody: string;
}

export async function receiveMondayWebhook(
  input: ReceiveMondayWebhookInput,
): Promise<ReceiveResult> {
  const { request, rawBody } = input;

  // 1. Parse JSON defensively (needed for both challenge + event paths).
  let parsedBody: Record<string, unknown> | null = null;
  try {
    const candidate = JSON.parse(rawBody) as unknown;
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      parsedBody = candidate as Record<string, unknown>;
    }
  } catch {
    parsedBody = null;
  }

  // 2. Challenge handshake — echo BEFORE signature verification.
  if (parsedBody && typeof parsedBody.challenge === "string") {
    return { kind: "challenge", challenge: parsedBody.challenge };
  }

  // 3. Signature verify — events fail closed.
  const secret = getWebhookSecret();
  const signatureHeader = request.headers.get(SIGNATURE_HEADER);
  const verifyResult = verifyMondaySignature(rawBody, signatureHeader, secret);
  if (!verifyResult.valid) {
    throw new InvalidSignatureError(
      `Monday webhook: signature verification failed (${verifyResult.reason}).`,
    );
  }

  // A verified signature over a non-JSON body is malformed.
  if (!parsedBody) {
    throw new InvalidSignatureError(
      "Monday webhook: body is not valid JSON despite a verified signature.",
    );
  }

  // 4. Strict-direct-lookup query params. Missing → 200 quiet ack.
  const query = parseQuery(request.url);
  if (!query) return { kind: "unknown_workflow" };

  // 5. Resolve the trigger row.
  const trigger = await triggerResourcesRepo.findByWorkflowAndNode(
    query.workflowId,
    query.nodeId,
  );
  if (!trigger || trigger.provider !== "monday") {
    return { kind: "unknown_workflow" };
  }

  // 6. Classify the inbound Monday event type.
  const ev = getEventObject(parsedBody);
  const inboundEventTypeRaw =
    typeof ev.type === "string" ? ev.type : null;
  const inboundType = classifyMondayEvent(inboundEventTypeRaw);
  if (!inboundType) {
    return { kind: "unsupported_event", eventType: inboundEventTypeRaw };
  }

  // 7. Per-trigger event-type filter.
  if (inboundType !== trigger.eventType) {
    return {
      kind: "event_type_mismatch",
      triggerEventType: trigger.eventType,
      inboundType,
    };
  }

  // 8. Normalize → TriggerEvent.
  const normalized = NORMALIZERS[inboundType](ev);
  return { kind: "events", events: [normalized] };
}
