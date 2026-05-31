import type { TriggerEvent } from "@/contracts/triggerEvent";
import { InvalidSignatureError } from "@/core/triggers/errors";
import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";
import { checkValidationHandshake } from "@/integrations/_shared/microsoft/webhooks/validation";
import { getActiveForExecution } from "@/repositories/integrations";
import * as triggerResourcesRepo from "@/repositories/triggerResources";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { eventsGet } from "../api/eventsGet";
import {
  normalize,
  normalizeDeleted,
} from "../triggers/eventChanged/normalize";

/**
 * Verify and parse an inbound Microsoft Graph notification for the
 * Outlook Calendar `event_changed` trigger.
 *
 * Mirrors Slice 6 mail's webhook receive shape, with two calendar-
 * specific differences:
 *   1. **`changeType: "deleted"` minimal payload.** Calendar deletes
 *      often hard-delete the resource immediately; the `eventsGet` 404
 *      branch emits `normalizeDeleted(eventId, ctx)` so workflows can
 *      still react. Slice 7 plan §"`changeType: 'deleted'` handling".
 *   2. **Calendar-level notifications filtered out.** Subscription on
 *      `/me/events` occasionally fires for calendar-level changes
 *      (Users/{id}/Calendars/{calId}); we silently skip notifications
 *      whose `resourceData["@odata.type"]` is not
 *      `#Microsoft.Graph.Event`. Slice 7 plan §"Risk callouts" #3.
 *
 * Slice 7 plan §"`event_changed` trigger algorithm" — Webhook receive:
 *   - **Validation handshake.** When `?validationToken=...` is present
 *     in the URL OR the body is `text/plain` with no signature, return
 *     the token as-is with `text/plain` 200. Must respond within 10s
 *     so we do no DB I/O on this branch.
 *   - **Notification.** Body is `{ "value": [{ subscriptionId,
 *     clientState, changeType, resource, resourceData: { id }, ... }] }`.
 *     For each notification:
 *       1. Look up trigger row by config.subscriptionId. Skip if
 *          missing (subscription belongs to a deactivated workflow).
 *       2. Verify clientState matches what we stored. Mismatch → log +
 *          skip (never raise — avoids surfacing potential probing).
 *       3. Filter to event-shaped resources only.
 *       4. Fetch the event via /me/events/{id} (refreshAndRetry). On
 *          404 with `changeType: "deleted"` emit a minimal payload; on
 *          404 with any other changeType, log + skip (event removed
 *          between notification and fetch, but we can't reconstruct).
 *       5. Normalize → TriggerEvent. Append to events list.
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

const EVENT_ODATA_TYPE = "#microsoft.graph.event";

function isEventResource(item: NotificationItem): boolean {
  const odataType = item.resourceData?.["@odata.type"];
  // Slice 7 plan §"Risk callouts" #3: subscription on /me/events
  // occasionally fires for calendar-level changes. Filter to events
  // only. Case-insensitive match because Graph occasionally varies the
  // casing on the type discriminator.
  if (!odataType) {
    // No odata type — assume it's an event (back-compat with payloads
    // that omit the discriminator). Misclassified calendar-level
    // changes will 404 on the subsequent eventsGet and get skipped.
    return true;
  }
  return odataType.toLowerCase() === EVENT_ODATA_TYPE;
}

export async function receiveOutlookCalendarWebhook(
  request: Request,
): Promise<ReceiveResult> {
  // Validation handshake (query token OR text/plain body) is shared
  // across every Microsoft webhook route. The helper consumes the body
  // ONCE — we use the returned bodyText for downstream JSON parsing.
  const { validationToken, bodyText } = await checkValidationHandshake(
    request,
  );
  if (validationToken !== null) {
    return { kind: "validation", token: validationToken };
  }

  // Notification path. Parse body as JSON; malformed body → spoof signal.
  let envelope: NotificationEnvelope;
  try {
    envelope = JSON.parse(bodyText) as NotificationEnvelope;
  } catch {
    throw new InvalidSignatureError(
      "Microsoft Outlook Calendar webhook: body is not valid JSON",
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
    const eventId = notification.resourceData?.id;
    const changeType = notification.changeType ?? "updated";
    const incomingClientState = notification.clientState;

    if (!subscriptionId || !eventId) {
      console.warn(
        JSON.stringify({
          event: "webhook.outlook_calendar.malformed_notification",
          subscriptionId: subscriptionId ?? null,
          eventId: eventId ?? null,
        }),
      );
      continue;
    }

    if (!isEventResource(notification)) {
      console.debug(
        JSON.stringify({
          event: "webhook.outlook_calendar.non_event_resource",
          subscriptionId,
          odataType: notification.resourceData?.["@odata.type"] ?? null,
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
          event: "webhook.outlook_calendar.unknown_subscription",
          subscriptionId,
        }),
      );
      continue;
    }
    const trigger = matches[0]!;

    // 2. clientState verification. Mismatch logged but never thrown —
    //    same Slice 6 reasoning: exposing the mismatch via a 401 would
    //    help an attacker probe valid subscriptionIds.
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
          event: "webhook.outlook_calendar.client_state_mismatch",
          subscriptionId,
        }),
      );
      continue;
    }

    // 3. Fetch the full event. The notification envelope only carries
    //    the event id; the body lives behind /me/events/{id}.
    const integration = await getActiveForExecution(trigger.workflowAccountId!,
      trigger.provider,
      trigger.providerAccountId,
    );
    if (!integration) {
      console.warn(
        JSON.stringify({
          event: "webhook.outlook_calendar.no_integration",
          userId: trigger.userId,
        }),
      );
      continue;
    }

    let event;
    try {
      event = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "microsoft-outlook-calendar",
        providerAccountId: integration.providerAccountId,
        apiCall: (accessToken) => eventsGet({ accessToken, eventId }),
      });
    } catch (err) {
      if (err instanceof NotFoundError) {
        if (changeType === "deleted") {
          // Event is gone (hard-delete). Emit minimal payload so
          // workflows can still react to the deletion.
          events.push(
            normalizeDeleted(eventId, {
              subscriptionId,
              changeType,
              notificationOccurredAt: occurredAt,
              providerAccountId: integration.providerAccountId,
            }),
          );
          continue;
        }
        // changeType: created / updated for a now-missing resource.
        // Best-effort skip — body is unrecoverable.
        console.debug(
          JSON.stringify({
            event: "webhook.outlook_calendar.event_gone",
            subscriptionId,
            eventId,
            changeType,
          }),
        );
        continue;
      }
      throw err;
    }

    // 4. Normalize → TriggerEvent. accountId on the event is the
    //    integration's providerAccountId (the email).
    events.push(
      normalize(event, {
        subscriptionId,
        changeType,
        notificationOccurredAt: occurredAt,
        providerAccountId: integration.providerAccountId,
      }),
    );
  }

  return { kind: "events", events };
}
