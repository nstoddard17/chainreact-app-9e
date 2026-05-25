import type { TriggerEvent } from "@/contracts/triggerEvent";
import { InvalidSignatureError } from "@/core/triggers/errors";
import { verifyChannelToken } from "@/integrations/_shared/google/channelToken";
import * as triggerResourcesRepo from "@/repositories/triggerResources";
import { pull as documentUpdatedPull } from "../triggers/documentUpdated/pull";
import { pull as newDocumentPull } from "../triggers/newDocument/pull";

/**
 * Verify and parse an inbound Google Docs push notification —
 * Slice 3.GDOCS-5.
 *
 * Mirrors `integrations/google-sheets/webhooks/receive.ts` 1:1. Google
 * Docs triggers ride Drive's `files.watch` transport, so the X-Goog-*
 * headers are identical to Drive's:
 *   - X-Goog-Channel-Id          channelId we registered
 *   - X-Goog-Channel-Token       HMAC token we registered
 *   - X-Goog-Resource-Id         resource id from files.watch response
 *   - X-Goog-Resource-State      `sync` | `add` | `change` | `remove` |
 *                                `update` | `trash` | `untrash`
 *
 * Resource_state doesn't discriminate dispatch — each trigger's pull
 * function decides what to do via mimeType + change-kind filtering in
 * normalize. Dispatch is by `trigger.eventType`:
 *   - `new_document`      → newDocumentPull (filters to created + Docs)
 *   - `document_updated`  → documentUpdatedPull (filters to updated + Docs)
 *
 * Outcomes:
 *   - `handshake`: resource_state === "sync". Acknowledge with 200, no
 *     dispatch.
 *   - `unknown_channel`: channelId doesn't match a trigger row. Quietly
 *     ack (Google may be delivering late notifications for a stopped
 *     watch — 401 would cause noisy retries during normal channel
 *     lifecycle).
 *   - `events`: state ≠ sync AND token verifies. Pull + return events.
 *
 * Throws:
 *   - `InvalidSignatureError` on missing headers OR channel token
 *     mismatch (spoof attempt). Route maps to 401.
 */
export type ReceiveResult =
  | { kind: "handshake" }
  | { kind: "unknown_channel" }
  | { kind: "events"; events: TriggerEvent[] };

export async function receiveDocsWebhook(
  request: Request,
): Promise<ReceiveResult> {
  const channelId = request.headers.get("x-goog-channel-id");
  const channelToken = request.headers.get("x-goog-channel-token");
  const resourceState = request.headers.get("x-goog-resource-state");

  if (!channelId || !channelToken) {
    throw new InvalidSignatureError(
      "Missing X-Goog-Channel-Id or X-Goog-Channel-Token",
    );
  }

  const matches = await triggerResourcesRepo.listByConfigContains({
    channelId,
  });

  if (matches.length === 0) {
    return { kind: "unknown_channel" };
  }

  const trigger = matches[0]!;

  if (!verifyChannelToken({ channelId }, channelToken)) {
    throw new InvalidSignatureError("Channel token mismatch");
  }

  if (resourceState === "sync") {
    return { kind: "handshake" };
  }

  if (trigger.eventType === "new_document") {
    const result = await newDocumentPull(trigger);
    return { kind: "events", events: result.events };
  }
  if (trigger.eventType === "document_updated") {
    const result = await documentUpdatedPull(trigger);
    return { kind: "events", events: result.events };
  }

  // Unknown event type on a registered channel: ack without
  // dispatching. The renewal cron will let the watch expire
  // naturally once the trigger row is gone.
  console.warn(
    JSON.stringify({
      event: "google_docs.receive.unknown_event_type",
      channelId,
      triggerId: trigger.id,
      eventType: trigger.eventType,
    }),
  );
  return { kind: "events", events: [] };
}
