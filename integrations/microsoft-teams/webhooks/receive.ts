import type { TriggerEvent } from "@/contracts/triggerEvent";
import { InvalidSignatureError } from "@/core/triggers/errors";
import { checkValidationHandshake } from "@/integrations/_shared/microsoft/webhooks/validation";
import * as triggerResourcesRepo from "@/repositories/triggerResources";
import { pull } from "../triggers/newChannelMessage/pull";

/**
 * Verify and parse an inbound Microsoft Graph notification for the
 * Teams `new_channel_message` trigger.
 *
 * Mirrors slice 6 / 7 / 8 receive shape with Teams-specific tweaks:
 *   1. **Single id-fetch branch.** Channel-messages subscriptions
 *      always carry the `resourceData.id` (the new message's id);
 *      there's no `id === "root"` sentinel to handle (that's an
 *      OneDrive drive-root quirk). Hydrate via `channelMessageGet`.
 *   2. **chatMessage @odata.type filter.** Defensive filter on
 *      `resourceData["@odata.type"] === "#Microsoft.Graph.chatMessage"`
 *      to skip non-message resource notifications (rare but observed
 *      in V1 incident reports — subscription health pings).
 *
 * Validation handshake uses the shared helper (no DB I/O, 10s budget).
 *
 * Outcomes:
 *   - `validation`: route echoes the token verbatim.
 *   - `events`: zero or more TriggerEvents to dispatch.
 *
 * Throws:
 *   - `InvalidSignatureError` when the body is malformed (NOT a
 *     validation request AND NOT a parseable notification envelope).
 *     The route maps to 401.
 */

export type ReceiveResult =
  | { kind: "validation"; token: string }
  | { kind: "events"; events: TriggerEvent[] };

interface NotificationItem {
  subscriptionId?: string;
  clientState?: string;
  changeType?: string;
  resource?: string;
  resourceData?: { id?: string; "@odata.type"?: string };
  tenantId?: string;
  subscriptionExpirationDateTime?: string;
}

interface NotificationEnvelope {
  value?: NotificationItem[];
}

const CHAT_MESSAGE_ODATA_TYPE = "#microsoft.graph.chatmessage";

function isChatMessageResource(item: NotificationItem): boolean {
  const odataType = item.resourceData?.["@odata.type"];
  if (!odataType) {
    // Some Graph deliveries omit @odata.type; trust the subscription
    // resource scope and let the id-fetch pull surface mismatches.
    return true;
  }
  return odataType.toLowerCase() === CHAT_MESSAGE_ODATA_TYPE;
}

export async function receiveTeamsWebhook(
  request: Request,
): Promise<ReceiveResult> {
  // Validation handshake — query token OR text/plain body. Shared
  // helper consumes the body once; we use the returned bodyText for
  // downstream JSON parsing.
  const { validationToken, bodyText } = await checkValidationHandshake(
    request,
  );
  if (validationToken !== null) {
    return { kind: "validation", token: validationToken };
  }

  // Notification path. Parse body as JSON; malformed → spoof signal.
  let envelope: NotificationEnvelope;
  try {
    envelope = JSON.parse(bodyText) as NotificationEnvelope;
  } catch {
    throw new InvalidSignatureError(
      "Microsoft Teams webhook: body is not valid JSON",
    );
  }

  const notifications = Array.isArray(envelope.value) ? envelope.value : [];
  if (notifications.length === 0) {
    return { kind: "events", events: [] };
  }

  const events: TriggerEvent[] = [];
  const occurredAt = new Date().toISOString();

  for (const notification of notifications) {
    const subscriptionId = notification.subscriptionId;
    const incomingClientState = notification.clientState;

    if (!subscriptionId) {
      console.warn(
        JSON.stringify({
          event: "webhook.microsoft_teams.malformed_notification",
          subscriptionId: null,
        }),
      );
      continue;
    }

    if (!isChatMessageResource(notification)) {
      console.debug(
        JSON.stringify({
          event: "webhook.microsoft_teams.non_chat_message_resource",
          subscriptionId,
          odataType: notification.resourceData?.["@odata.type"] ?? null,
        }),
      );
      continue;
    }

    // 1. Look up the trigger row by subscription id.
    const matches = await triggerResourcesRepo.listByConfigContains({
      subscriptionId,
    });
    if (matches.length === 0) {
      console.debug(
        JSON.stringify({
          event: "webhook.microsoft_teams.unknown_subscription",
          subscriptionId,
        }),
      );
      continue;
    }
    const trigger = matches[0]!;

    // 2. clientState verification. Mismatch logged but never thrown —
    //    same Slice 6 + 7 + 8 reasoning: avoid probing exposure (V2
    //    webhook contract).
    const storedClientState = (
      trigger.config as { clientState?: string }
    ).clientState;
    if (
      !storedClientState ||
      !incomingClientState ||
      storedClientState !== incomingClientState
    ) {
      console.warn(
        JSON.stringify({
          event: "webhook.microsoft_teams.client_state_mismatch",
          subscriptionId,
        }),
      );
      continue;
    }

    // 3. Hydrate message via id-fetch GET.
    const messageId = notification.resourceData?.id?.trim();
    if (!messageId) {
      console.warn(
        JSON.stringify({
          event: "webhook.microsoft_teams.missing_message_id",
          subscriptionId,
        }),
      );
      continue;
    }
    const result = await pull(trigger, messageId, occurredAt);
    for (const e of result.events) events.push(e);
  }

  return { kind: "events", events };
}
