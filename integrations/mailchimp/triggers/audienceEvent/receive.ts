import type { TriggerEvent } from "@/contracts/triggerEvent";
import * as triggerResourcesRepo from "@/repositories/triggerResources";
import {
  normalizeMailchimpEvent,
  parseMailchimpFormBody,
} from "@/integrations/_shared/mailchimp/webhooks/normalize";
import {
  isAllowedMailchimpEventType,
  type MailchimpAllowedEventType,
} from "./allowedEventTypes";

/**
 * Parse and gate an inbound Mailchimp webhook delivery — Slice 14 Commit 4.
 *
 * **No signature scheme.** Mailchimp doesn't sign webhooks (see
 * `_shared/mailchimp/webhooks/signature.ts`). The receive helper
 * authenticates via four URL/payload-derived layers:
 *
 *   1. **Direct workflow/node lookup.** The URL MUST carry
 *      `?workflowId=X&nodeId=Y`. Missing → 200 quiet ack
 *      (unknown_workflow). Mailchimp's webhook URL was issued at
 *      activation time and never propagates further; an attacker
 *      without it can't reach any real trigger row.
 *
 *   2. **Audience id match.** The form body's `data[list_id]` MUST
 *      match the trigger's stored `audienceId`. Mismatch → 200
 *      quiet ack (audience_mismatch). Defense against an attacker
 *      who knows the URL but tries to deliver an event for a
 *      different list.
 *
 *   3. **Event-type allowlist.** The form body's top-level `type`
 *      MUST be in the trigger's activation-time `eventTypes` AND
 *      in the global Slice 14 allowlist. Out-of-list → 200 ack
 *      (unsupported_event_type).
 *
 *   4. **sha256(rawBody) dedup.** Downstream — `dispatchTriggerEvent`
 *      runs the dedup check via `webhook_event_dedup`. The
 *      normalized `TriggerEvent.eventId` IS the sha256 hash so the
 *      generic dedup table works without Mailchimp-specific code.
 *
 * Outcomes:
 *   - `unknown_workflow`: query params missing OR no matching
 *     trigger row OR row provider/eventType mismatch. Route 200-acks.
 *   - `audience_mismatch`: trigger exists but the inbound list id
 *     doesn't match the trigger's audience. Route 200-acks.
 *   - `unsupported_event_type`: trigger exists, audience matches,
 *     but the event type is outside the allowlist or trigger
 *     selection. Route 200-acks.
 *   - `events`: parsed + validated. Route dispatches.
 *
 * Throws are NOT expected at this layer — every "bad" inbound is a
 * 200 quiet ack (Mailchimp retries forever on non-2xx). Genuine
 * server errors (DB outage, etc.) propagate to the route which
 * returns 500.
 */

export type ReceiveResult =
  | { kind: "unknown_workflow" }
  | { kind: "audience_mismatch"; expected: string; received: string }
  | { kind: "unsupported_event_type"; receivedType: string }
  | { kind: "events"; events: TriggerEvent[] };

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

export interface ReceiveInput {
  /** Request URL (carries the `?workflowId=&nodeId=` query string). */
  url: string;
  /** Raw form-encoded request body — `sha256(rawBody)` is the dedup key. */
  rawBody: string;
}

export async function receiveMailchimpWebhook(
  input: ReceiveInput,
): Promise<ReceiveResult> {
  // 1. Direct workflow/node lookup via URL query params.
  const query = parseQuery(input.url);
  if (!query) return { kind: "unknown_workflow" };

  const trigger = await triggerResourcesRepo.findByWorkflowAndNode(
    query.workflowId,
    query.nodeId,
  );
  if (
    !trigger ||
    trigger.provider !== "mailchimp" ||
    trigger.eventType !== "audience_event"
  ) {
    return { kind: "unknown_workflow" };
  }

  // 2. Parse the form body. Even a malformed/empty body produces a
  //    structured shape (parseMailchimpFormBody never throws); the
  //    audience/eventType gates below will filter it out.
  const parsed = parseMailchimpFormBody(input.rawBody);

  // 3. Audience id match against the trigger row's stored audienceId.
  const triggerConfig = trigger.config as {
    audienceId?: string;
    eventTypes?: ReadonlyArray<string>;
  };
  const expectedAudienceId = triggerConfig.audienceId ?? "";
  const receivedAudienceId = parsed.data.list_id ?? "";
  if (
    !expectedAudienceId ||
    !receivedAudienceId ||
    expectedAudienceId !== receivedAudienceId
  ) {
    return {
      kind: "audience_mismatch",
      expected: expectedAudienceId,
      received: receivedAudienceId,
    };
  }

  // 4. Event-type allowlist filter — must be globally allowed AND
  //    selected at activation time.
  const subscribedEventTypes: ReadonlyArray<string> =
    triggerConfig.eventTypes ?? [];
  const receivedType = parsed.type;
  const isGloballyAllowed =
    typeof receivedType === "string" &&
    isAllowedMailchimpEventType(receivedType);
  const isWorkflowSubscribed =
    typeof receivedType === "string" &&
    subscribedEventTypes.includes(receivedType as MailchimpAllowedEventType);
  if (!isGloballyAllowed || !isWorkflowSubscribed) {
    return { kind: "unsupported_event_type", receivedType };
  }

  // 5. Normalize to canonical TriggerEvent. accountId pulled from
  //    the trigger row's stored accountId (matches the integration's
  //    providerAccountId = Mailchimp account_id).
  const event = normalizeMailchimpEvent({
    rawBody: input.rawBody,
    parsed,
    accountId: trigger.providerAccountId ?? "",
  });
  return { kind: "events", events: [event] };
}
