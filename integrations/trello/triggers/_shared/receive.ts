import type { TriggerEvent } from "@/contracts/triggerEvent";
import { InvalidSignatureError } from "@/core/triggers/errors";
import * as triggerResourcesRepo from "@/repositories/triggerResources";
import { verifyTrelloSignature } from "@/integrations/_shared/trello/webhooks/signature";
import {
  TRIGGER_EVENT_TO_NORMALIZED,
  classifyTrelloAction,
  normalizeTrelloEvent,
  type TrelloEventType,
  type TrelloTriggerEventName,
} from "./normalize";

/**
 * Shared receive helper for Trello board webhooks — Slice 17 Commit 5.
 *
 * Single route at `/api/webhooks/trello` handles all 6 V2 trigger
 * types. Strict-direct-lookup pattern (same as GitHub / Shopify /
 * Mailchimp):
 *
 *   - URL carries `?workflowId=X&nodeId=Y` (set at activation).
 *   - Receive route reads raw body, then HEAD/POST methods diverge:
 *     - HEAD → 200 (Trello's webhook-creation HTTP-verb probe;
 *       handled by the route, not this helper).
 *     - POST → this helper.
 *   - This helper:
 *       1. Parse query params (missing → 200 quiet ack).
 *       2. Read raw body.
 *       3. Look up the trigger row via `findByWorkflowAndNode`.
 *          Missing row / provider mismatch / not-trello → 200 ack.
 *       4. Verify signature against `TRELLO_CLIENT_SECRET`.
 *          Missing secret → MissingSecretError → route 503.
 *          Anything else invalid → InvalidSignatureError → route 401.
 *       5. Parse JSON body.
 *       6. Classify action → trello.* event type.
 *          Unsupported action → 200 ack (no enqueue).
 *       7. Filter against trigger row's `config.eventType`. If the
 *          inbound event type doesn't match what THIS trigger node
 *          cares about, 200 ack (no enqueue). One board webhook
 *          delivers ALL board events; per-trigger filtering happens
 *          here.
 *       8. Normalize → TriggerEvent → dispatch.
 *
 * V1's verification was a no-op. Slice 17 plan §"V1 bugs to fix" #1
 * closes the gap — V2 fails-closed at 401 on bad signature, 503 on
 * missing server secret.
 */

export class MissingSecretError extends Error {
  constructor() {
    super(
      "Trello webhook: TRELLO_CLIENT_SECRET env var is not set — refusing to accept unsigned-equivalent traffic.",
    );
    this.name = "MissingSecretError";
  }
}

export type ReceiveResult =
  | { kind: "unknown_workflow" }
  | { kind: "unsupported_event"; actionType: string | null }
  | {
      kind: "event_type_mismatch";
      triggerEventType: string;
      inboundEventType: TrelloEventType;
    }
  | { kind: "board_mismatch"; expected: string; received: string }
  | { kind: "events"; events: TriggerEvent[] };

const SIGNATURE_HEADER = "x-trello-webhook";

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
  const secret = process.env.TRELLO_CLIENT_SECRET;
  if (!secret) throw new MissingSecretError();
  return secret;
}

export interface ReceiveTrelloWebhookInput {
  request: Request;
  /** Raw body — receive ROUTE captures this BEFORE any parse. */
  rawBody: string;
}

export async function receiveTrelloWebhook(
  input: ReceiveTrelloWebhookInput,
): Promise<ReceiveResult> {
  const { request, rawBody } = input;

  // 1. Strict-direct-lookup query params. Missing → 200 quiet ack.
  const query = parseQuery(request.url);
  if (!query) return { kind: "unknown_workflow" };

  // 2. Look up the trigger row FIRST so we know the registered
  //    callbackURL to verify the signature against (Trello includes
  //    the callback URL in the HMAC message).
  const trigger = await triggerResourcesRepo.findByWorkflowAndNode(
    query.workflowId,
    query.nodeId,
  );
  if (!trigger || trigger.provider !== "trello") {
    return { kind: "unknown_workflow" };
  }
  const triggerConfig = trigger.config as {
    boardId?: string;
    eventType?: string;
    callbackURL?: string;
  };
  if (
    typeof triggerConfig.callbackURL !== "string" ||
    typeof triggerConfig.eventType !== "string"
  ) {
    return { kind: "unknown_workflow" };
  }

  // 3. Verify signature using the EXACT callbackURL stored at
  //    activation time. Trello's HMAC includes the callback URL — a
  //    mismatch between what we register and what we verify against
  //    silently fails.
  const secret = getWebhookSecret();
  const signatureHeader = request.headers.get(SIGNATURE_HEADER);
  const verifyResult = verifyTrelloSignature(
    rawBody,
    triggerConfig.callbackURL,
    signatureHeader,
    secret,
  );
  if (!verifyResult.valid) {
    throw new InvalidSignatureError(
      `Trello webhook: signature verification failed (${verifyResult.reason}).`,
    );
  }

  // 4. Parse JSON body.
  if (!rawBody.length) {
    // Trello may send empty bodies on its initial HEAD probe; POST
    // bodies with signatures should never be empty. Treat as quiet
    // ack rather than a hard error.
    return { kind: "unsupported_event", actionType: null };
  }
  let parsedBody: Record<string, unknown>;
  try {
    parsedBody = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    throw new InvalidSignatureError(
      "Trello webhook: body is not valid JSON despite a verified signature.",
    );
  }

  // 5. Classify action → V2 event type.
  const inboundEventType = classifyTrelloAction(parsedBody);
  if (!inboundEventType) {
    const actionType =
      (parsedBody.action as { type?: string } | undefined)?.type ?? null;
    return { kind: "unsupported_event", actionType };
  }

  // 6. Per-trigger event-type filter. The Trello board webhook
  //    delivers ALL events; each trigger row cares about ONE event
  //    type. If they don't match, 200 ack without dispatch.
  const triggerNormalized = TRIGGER_EVENT_TO_NORMALIZED[triggerConfig.eventType];
  if (triggerNormalized !== inboundEventType) {
    return {
      kind: "event_type_mismatch",
      triggerEventType: triggerConfig.eventType,
      inboundEventType,
    };
  }

  // 7. Board id mismatch is theoretically impossible (Trello sends
  //    webhooks for the board they're bound to), but check
  //    defensively — a hostile actor with the URL+secret would still
  //    need to match the board id to dispatch.
  const inboundBoardId = (
    (parsedBody.action as { data?: { board?: { id?: string } } } | undefined)
      ?.data?.board?.id
  );
  if (
    typeof triggerConfig.boardId === "string" &&
    typeof inboundBoardId === "string" &&
    inboundBoardId !== triggerConfig.boardId
  ) {
    return {
      kind: "board_mismatch",
      expected: triggerConfig.boardId,
      received: inboundBoardId,
    };
  }

  // 8. Normalize to canonical TriggerEvent. Pass the V2 trigger
  //    eventType (short form like "new_card") so dispatch's
  //    (provider, eventType) lookup against trigger_resources works.
  //    The classified namespaced form goes into payload for advanced
  //    workflow refs.
  const normalized = normalizeTrelloEvent({
    body: parsedBody,
    triggerEventType: triggerConfig.eventType as TrelloTriggerEventName,
    classifiedType: inboundEventType,
  });
  return { kind: "events", events: [normalized] };
}
