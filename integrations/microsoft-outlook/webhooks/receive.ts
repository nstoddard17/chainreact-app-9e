import type { TriggerEvent } from "@/contracts/triggerEvent";
import { InvalidSignatureError } from "@/core/triggers/errors";
import { getActiveForExecution } from "@/repositories/integrations";
import * as triggerResourcesRepo from "@/repositories/triggerResources";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { getMessage } from "../api/getMessage";
import { NotFoundError } from "../api/errors";
import { normalize } from "../triggers/newEmail/normalize";

/**
 * Verify and parse an inbound Microsoft Graph notification.
 *
 * Slice 6 plan §"Webhook receive":
 *   - **Validation handshake.** When `?validationToken=...` is present
 *     in the URL OR the body is `text/plain` with no signature, return
 *     the token as-is with `text/plain` 200. Must respond within 10s
 *     so we do no DB I/O on this branch — the route owns the response.
 *   - **Notification.** Body is `{ "value": [{ subscriptionId,
 *     clientState, changeType, resource, resourceData: { id }, ... }] }`.
 *     For each notification:
 *       1. Look up trigger row by config.subscriptionId. Skip if missing
 *          (subscription belongs to a deactivated workflow).
 *       2. Verify clientState matches what we stored. Mismatch → log +
 *          skip (never raise — avoids surfacing potential probing).
 *       3. Fetch the message via /me/messages/{id} (refreshAndRetry).
 *          On 404 the message was deleted between notification and
 *          fetch — log + skip.
 *       4. Normalize → TriggerEvent. Append to events list.
 *
 * Outcomes:
 *   - `validation`: validation-handshake request — the route echoes the
 *     token. Returned shape carries the token so the route can respond
 *     with text/plain 200 verbatim.
 *   - `events`: zero or more TriggerEvents to dispatch.
 *
 * Throws:
 *   - `InvalidSignatureError` when the body is malformed (NOT a
 *     validation request and NOT a parseable notification envelope).
 *     Genuinely-corrupt request — the route maps to 401.
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

export async function receiveOutlookWebhook(
  request: Request,
): Promise<ReceiveResult> {
  const url = new URL(request.url);
  const validationToken =
    url.searchParams.get("validationToken") ??
    url.searchParams.get("validationtoken");

  if (validationToken) {
    return { kind: "validation", token: validationToken };
  }

  // Microsoft sometimes posts the validation token as the body with
  // Content-Type: text/plain (per V1's webhook route handling). This
  // branch is harmless when a notification body is JSON — it only
  // applies when the content-type signals plain text.
  const contentType = request.headers.get("content-type") ?? "";
  const bodyText = await request.text();
  if (contentType.toLowerCase().includes("text/plain") && bodyText.trim()) {
    return { kind: "validation", token: bodyText };
  }

  // Notification path. Parse body as JSON; malformed body → spoof signal.
  let envelope: NotificationEnvelope;
  try {
    envelope = JSON.parse(bodyText) as NotificationEnvelope;
  } catch {
    throw new InvalidSignatureError(
      "Microsoft Outlook webhook: body is not valid JSON",
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
    const messageId = notification.resourceData?.id;
    const changeType = notification.changeType ?? "created";
    const incomingClientState = notification.clientState;

    if (!subscriptionId || !messageId) {
      console.warn(
        JSON.stringify({
          event: "webhook.outlook.malformed_notification",
          subscriptionId: subscriptionId ?? null,
          messageId: messageId ?? null,
        }),
      );
      continue;
    }

    // 1. Look up the trigger row by subscription id (stored in config).
    const matches = await triggerResourcesRepo.listByConfigContains({
      subscriptionId,
    });
    if (matches.length === 0) {
      // Subscription belongs to a deactivated workflow OR a stale
      // subscription Microsoft hasn't cleaned up yet. Quietly skip.
      console.debug(
        JSON.stringify({
          event: "webhook.outlook.unknown_subscription",
          subscriptionId,
        }),
      );
      continue;
    }
    const trigger = matches[0]!;

    // 2. clientState verification. Mismatch is logged but never thrown —
    //    Slice 6 plan §"Webhook receive" item 2. Exposing the mismatch
    //    via a 401 would help an attacker probe valid subscriptionIds.
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
          event: "webhook.outlook.client_state_mismatch",
          subscriptionId,
        }),
      );
      continue;
    }

    // 3. Fetch the full message. The notification envelope only carries
    //    the message id; the body lives behind /me/messages/{id}.
    const integration = await getActiveForExecution(
      trigger.userId,
      trigger.provider,
      trigger.accountId,
    );
    if (!integration) {
      console.warn(
        JSON.stringify({
          event: "webhook.outlook.no_integration",
          userId: trigger.userId,
        }),
      );
      continue;
    }

    let message;
    try {
      message = await refreshAndRetry({
        userId: integration.userId,
        provider: "microsoft-outlook",
        accountId: integration.providerAccountId,
        apiCall: (accessToken) => getMessage({ accessToken, messageId }),
      });
    } catch (err) {
      if (err instanceof NotFoundError) {
        // Message deleted between notification and fetch — skip.
        console.debug(
          JSON.stringify({
            event: "webhook.outlook.message_gone",
            subscriptionId,
            messageId,
          }),
        );
        continue;
      }
      throw err;
    }

    // 4. Normalize → TriggerEvent. accountId on the event is the
    //    integration's providerAccountId (the email), matching how
    //    Sheets / Gmail / Calendar populate it.
    events.push(
      normalize(message, {
        subscriptionId,
        changeType,
        notificationOccurredAt: occurredAt,
        accountId: integration.providerAccountId,
      }),
    );
  }

  return { kind: "events", events };
}
