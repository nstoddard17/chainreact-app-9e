import type { TriggerEvent } from "@/contracts/triggerEvent";
import { InvalidSignatureError } from "@/core/triggers/errors";
import * as triggerResourcesRepo from "@/repositories/triggerResources";
import { pull } from "../triggers/eventChanged/pull";
import { verifyChannelToken } from "../utils/channelToken";

/**
 * Verify and parse an inbound Google Calendar push notification.
 *
 * Google sends push notifications as POST with these headers (no body
 * unless the resource_state is `sync`):
 *   - X-Goog-Channel-Id          channelId we registered
 *   - X-Goog-Channel-Token       HMAC token we registered
 *   - X-Goog-Resource-Id         resource id from events.watch response
 *   - X-Goog-Resource-State      `sync` (handshake) | `exists` (change)
 *   - X-Goog-Message-Number      monotonic per-channel
 *
 * Outcomes:
 *   - `handshake`: resource_state === "sync". Google's "this watch is now
 *     active" notification — return 200 with no dispatch.
 *   - `unknown_channel`: channelId doesn't match any trigger_resources row.
 *     Treat as success — Google may still be delivering late notifications
 *     for a stopped watch (in-flight window after channels.stop). Quietly
 *     ack with 200 rather than 401, to avoid noisy retries during normal
 *     channel lifecycle.
 *   - `events`: resource_state === "exists" AND token verifies. Pull the
 *     delta via events.list?syncToken=X and return the normalized
 *     TriggerEvents.
 *
 * Throws:
 *   - `InvalidSignatureError` when channelId is present in
 *     trigger_resources but the channel token doesn't match the HMAC.
 *     This is a genuine spoof attempt — the route maps to 401.
 *   - `InvalidSignatureError` when required headers are missing — the
 *     request didn't come from Google.
 */
export type ReceiveResult =
  | { kind: "handshake" }
  | { kind: "unknown_channel" }
  | { kind: "events"; events: TriggerEvent[] };

export async function receiveCalendarWebhook(
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

  // Look up the trigger row by channelId. The receive path is the only
  // consumer that needs this lookup, so we use the generic
  // listByConfigContains helper.
  const matches = await triggerResourcesRepo.listByConfigContains({
    channelId,
  });

  if (matches.length === 0) {
    // Channel not registered (or already stopped). Quietly ack — see file
    // comment for the rationale.
    return { kind: "unknown_channel" };
  }

  const trigger = matches[0]!;

  // Verify the HMAC. Tampering with the token while keeping a valid
  // channelId is the spoof scenario this catches.
  if (!verifyChannelToken({ channelId }, channelToken)) {
    throw new InvalidSignatureError("Channel token mismatch");
  }

  // Sync handshake: Google sends one of these immediately after a watch is
  // registered. No delta to pull, no events to dispatch.
  if (resourceState === "sync") {
    return { kind: "handshake" };
  }

  // Real change. Pull the delta — pull persists the new syncToken before
  // returning so we don't double-dispatch on subsequent notifications.
  const result = await pull(trigger);
  return { kind: "events", events: result.events };
}
