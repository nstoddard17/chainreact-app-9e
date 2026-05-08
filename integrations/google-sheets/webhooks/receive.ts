import { verifyChannelToken } from "@/integrations/_shared/google/channelToken";
import type { TriggerEvent } from "@/contracts/triggerEvent";
import { InvalidSignatureError } from "@/core/triggers/errors";
import * as triggerResourcesRepo from "@/repositories/triggerResources";
import { pull } from "../triggers/rowChanged/pull";

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
 * Slice 5 Batch 1 treats ALL non-`sync` resource_states as "go fetch the
 * row delta" — pull.ts reads `spreadsheets.values.get` and emits one
 * TriggerEvent per newly added row. We don't switch on resource_state
 * because the row-count comparison handles all the discrimination
 * (added/updated/removed) we care about; emitting only added events is
 * documented in the plan doc.
 *
 * Outcomes:
 *   - `handshake`: resource_state === "sync". Google's "this watch is
 *     now active" notification — return 200 with no dispatch.
 *   - `unknown_channel`: channelId doesn't match any trigger_resources
 *     row. Treat as success — Google may still be delivering late
 *     notifications for a stopped watch (in-flight window after
 *     channels.stop). Quietly ack with 200 rather than 401, to avoid
 *     noisy retries during normal channel lifecycle.
 *   - `events`: any other state AND token verifies. Pull the row delta
 *     via values.get and return the normalized TriggerEvents.
 *
 * Throws:
 *   - `InvalidSignatureError` when channelId is present in
 *     trigger_resources but the channel token doesn't match the HMAC.
 *     Genuine spoof attempt — the route maps to 401.
 *   - `InvalidSignatureError` when required headers are missing — the
 *     request didn't come from Google.
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

  // Real change. Pull the row delta — pull persists the new lastRowCount
  // before returning so a duplicate notification doesn't double-emit.
  const result = await pull(trigger);
  return { kind: "events", events: result.events };
}
