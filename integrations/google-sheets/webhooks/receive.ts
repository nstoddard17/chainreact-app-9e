import { verifyChannelToken } from "@/integrations/_shared/google/channelToken";
import type { TriggerEvent } from "@/contracts/triggerEvent";
import { InvalidSignatureError } from "@/core/triggers/errors";
import * as triggerResourcesRepo from "@/repositories/triggerResources";
import { pull as newWorksheetPull } from "../triggers/newWorksheet/pull";
import { pull as rowChangedPull } from "../triggers/rowChanged/pull";

/**
 * Verify and parse an inbound Google Sheets push notification.
 *
 * Sheets watches via Drive's file-watch transport, so the X-Goog-* headers
 * are identical to Drive's. The receive contract mirrors Drive's:
 *   - X-Goog-Channel-Id          channelId we registered
 *   - X-Goog-Channel-Token       HMAC token we registered
 *   - X-Goog-Resource-Id         resource id from files.watch response
 *   - X-Goog-Resource-State      `sync` (handshake) | `add` | `change` |
 *                                `remove` | `update` | `trash` | `untrash`
 *   - X-Goog-Message-Number      monotonic per-channel
 *
 * Slice 5 / Sheets 2.3 treat all non-`sync` resource_states as "go fetch
 * the delta". Dispatch by `trigger.eventType` to the right pull:
 *   - `row_changed` → row delta (added / updated / removed) via the
 *     bounded snapshot path (Commit 2 + Commit 3).
 *   - `new_worksheet` → worksheet-list delta via `spreadsheets.get`
 *     (Commit 4).
 *
 * Resource_state isn't used to discriminate because each pull
 * function handles all relevant change kinds via its own snapshot
 * comparison — Sheets' notification doesn't tell us WHAT inside the
 * spreadsheet changed, just THAT it did. Pull figures it out.
 *
 * Outcomes:
 *   - `handshake`: resource_state === "sync". Google's "this watch is
 *     now active" notification — return 200 with no dispatch.
 *   - `unknown_channel`: channelId doesn't match any trigger_resources
 *     row. Treat as success — Google may still be delivering late
 *     notifications for a stopped watch (in-flight window after
 *     channels.stop). Quietly ack with 200 rather than 401.
 *   - `events`: any other state AND token verifies. Pull the delta via
 *     the per-eventType handler and return the normalized TriggerEvents.
 *
 * Throws:
 *   - `InvalidSignatureError` when channelId is present in
 *     trigger_resources but the channel token doesn't match the HMAC.
 *   - `InvalidSignatureError` when required headers are missing.
 */
export type ReceiveResult =
  | { kind: "handshake" }
  | { kind: "unknown_channel" }
  | { kind: "events"; events: TriggerEvent[] };

export async function receiveSheetsWebhook(
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

  // Look up the trigger row by channelId.
  const matches = await triggerResourcesRepo.listByConfigContains({
    channelId,
  });

  if (matches.length === 0) {
    return { kind: "unknown_channel" };
  }

  const trigger = matches[0]!;

  // Verify the HMAC. Tampering with the token while keeping a valid
  // channelId is the spoof scenario this catches.
  if (!verifyChannelToken({ channelId }, channelToken)) {
    throw new InvalidSignatureError("Channel token mismatch");
  }

  // Sync handshake: Google sends one immediately after a watch is
  // registered. No delta to pull, no events to dispatch.
  if (resourceState === "sync") {
    return { kind: "handshake" };
  }

  // Real change. Dispatch by eventType to the right pull function.
  // Each trigger has its own channelId so the channel-to-trigger
  // lookup uniquely identifies the receiving trigger; eventType
  // tells us which pull to invoke.
  if (trigger.eventType === "row_changed") {
    const result = await rowChangedPull(trigger);
    return { kind: "events", events: result.events };
  }
  if (trigger.eventType === "new_worksheet") {
    const result = await newWorksheetPull(trigger);
    return { kind: "events", events: result.events };
  }
  // Unknown event type on a registered channel: treat as no-op +
  // structured log. The renewal cron will eventually let the watch
  // expire if the trigger was deleted; meanwhile we ack to avoid
  // Google retries.
  console.warn(
    JSON.stringify({
      event: "sheets.receive.unknown_event_type",
      channelId,
      triggerId: trigger.id,
      eventType: trigger.eventType,
    }),
  );
  return { kind: "events", events: [] };
}
