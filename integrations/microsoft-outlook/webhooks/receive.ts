import type { TriggerEvent } from "@/contracts/triggerEvent";
import { InvalidSignatureError } from "@/core/triggers/errors";
import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";
import { checkValidationHandshake } from "@/integrations/_shared/microsoft/webhooks/validation";
import { getActiveForExecution } from "@/repositories/integrations";
import * as triggerResourcesRepo from "@/repositories/triggerResources";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { getMessage, type GraphMessage } from "../api/getMessage";
import { normalize } from "../triggers/newEmail/normalize";
import {
  NewEmailTriggerFilterSchema,
  extractNewEmailFilterFields,
} from "../triggers/newEmail/configSchema";

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

    // 4. Per-trigger receive-time filtering. Each trigger eventType
    //    owns its own filter schema + match logic. Slice 6 baseline
    //    new_email workflows have NO filter fields in their config —
    //    the schema's defaults converge to "no filter" so they fire
    //    unchanged.
    //
    //    Outlook Mail 2.3 D-OM3 — new_email filters (5 V1 filters,
    //    folder via subscription resource handled in activate.ts; the
    //    rest applied here). email_sent / email_flagged filters ship
    //    in Commit 3 of the slice.
    if (trigger.eventType === "new_email") {
      if (!shouldFireNewEmail(message, trigger.config)) {
        continue;
      }
    }
    // Other eventTypes (`email_sent`, `email_flagged`) wire their
    // filter logic in Outlook Mail 2.3 Commit 3.

    // 5. Normalize → TriggerEvent. accountId on the event is the
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

/**
 * Apply the 5 V1 new_email filters at receive-time (folder handled at
 * activate-time via subscription resource routing). Returns `false`
 * when the message should be dropped (filter mismatch); `true` when
 * the trigger should fire.
 *
 * D-OM3 — V1 defaults preserved (subjectExactMatch: true,
 * hasAttachment: "any", importance: "any"). Slice 6 baseline workflows
 * with no filter config pass through unchanged.
 *
 * Filter logic mirrors V1's mega-route at app/api/webhooks/microsoft/route.ts:
 *   - `from`: case-insensitive exact match against sender address.
 *   - `subject` + `subjectExactMatch`: exact (case-insensitive) or
 *     substring match.
 *   - `hasAttachment` ("any" | "yes" | "no"): expected vs actual.
 *   - `importance` ("any" | "high" | "normal" | "low"): match level.
 */
function shouldFireNewEmail(
  message: GraphMessage,
  rawConfig: Readonly<Record<string, unknown>>,
): boolean {
  const filter = NewEmailTriggerFilterSchema.parse(
    extractNewEmailFilterFields(rawConfig),
  );

  // `from` filter — V1 single-email-string exact match.
  if (filter.from !== undefined) {
    const expected = filter.from.toLowerCase().trim();
    const actual =
      message.from?.emailAddress?.address?.toLowerCase().trim() ?? "";
    if (actual !== expected) return false;
  }

  // `subject` filter — exact OR substring based on subjectExactMatch.
  if (filter.subject !== undefined && filter.subject.length > 0) {
    const expected = filter.subject.toLowerCase().trim();
    const actual = (message.subject ?? "").toLowerCase().trim();
    if (filter.subjectExactMatch) {
      if (actual !== expected) return false;
    } else {
      if (!actual.includes(expected)) return false;
    }
  }

  // `hasAttachment` filter — "any" passes; "yes"/"no" gates.
  if (filter.hasAttachment !== "any") {
    const expectsAttachment = filter.hasAttachment === "yes";
    const has = message.hasAttachments === true;
    if (expectsAttachment !== has) return false;
  }

  // `importance` filter — "any" passes; otherwise require match.
  if (filter.importance !== "any") {
    const actual = (message.importance ?? "normal").toLowerCase();
    if (actual !== filter.importance) return false;
  }

  return true;
}
