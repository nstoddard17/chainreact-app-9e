import type { TriggerEvent } from "@/contracts/triggerEvent";
import { InvalidSignatureError } from "@/core/triggers/errors";
import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";
import { checkValidationHandshake } from "@/integrations/_shared/microsoft/webhooks/validation";
import { getActiveForExecution } from "@/repositories/integrations";
import * as triggerResourcesRepo from "@/repositories/triggerResources";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { getMessage, type GraphMessage } from "../api/getMessage";
import { normalize as normalizeNewEmail } from "../triggers/newEmail/normalize";
import { normalize as normalizeEmailSent } from "../triggers/emailSent/normalize";
import { normalize as normalizeEmailFlagged } from "../triggers/emailFlagged/normalize";
import {
  NewEmailTriggerFilterSchema,
  extractNewEmailFilterFields,
} from "../triggers/newEmail/configSchema";
import {
  EmailSentTriggerFilterSchema,
  extractEmailSentFilterFields,
} from "../triggers/emailSent/configSchema";
import {
  EmailFlaggedTriggerFilterSchema,
  extractEmailFlaggedFilterFields,
} from "../triggers/emailFlagged/configSchema";
import { parseCsvList } from "@/core/integrations/parseCsvList";

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
    //    Outlook Mail 2.3:
    //      - new_email (D-OM3): 5 V1 filters; folder routes via
    //        activation, the rest are receive-time.
    //      - email_sent (D-OM3): `to` + `subject` + `subjectExactMatch`
    //        receive-time filters.
    //      - email_flagged (D-OM4 V1-parity over-fire): receive-time
    //        skip when `flag.flagStatus !== "flagged"`. No prior-state
    //        cache.
    const ctx: NormalizeContext = {
      subscriptionId,
      changeType,
      notificationOccurredAt: occurredAt,
      accountId: integration.providerAccountId,
    };
    let normalized: TriggerEvent;
    switch (trigger.eventType) {
      case "new_email":
        if (!shouldFireNewEmail(message, trigger.config)) continue;
        normalized = normalizeNewEmail(message, ctx);
        break;
      case "email_sent":
        if (!shouldFireEmailSent(message, trigger.config)) continue;
        normalized = normalizeEmailSent(message, ctx);
        break;
      case "email_flagged":
        if (!shouldFireEmailFlagged(message, trigger.config)) continue;
        normalized = normalizeEmailFlagged(message, ctx);
        break;
      default:
        // Unknown eventType — log and skip (don't throw, to avoid 5xx
        // noise from misregistered triggers). webhook_event_dedup keeps
        // the system safe.
        console.warn(
          JSON.stringify({
            event: "webhook.outlook.unknown_event_type",
            eventType: trigger.eventType,
            subscriptionId,
          }),
        );
        continue;
    }

    // 5. Normalize → TriggerEvent. accountId on the event is the
    //    integration's providerAccountId (the email), matching how
    //    Sheets / Gmail / Calendar populate it.
    events.push(normalized);
  }

  return { kind: "events", events };
}

interface NormalizeContext {
  subscriptionId: string;
  changeType: string;
  notificationOccurredAt: string;
  accountId: string;
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

/**
 * Apply the 3 V1 email_sent filters at receive-time. Returns `false`
 * when the message should be dropped (filter mismatch).
 *
 * D-OM3 — V1-parity. `to` is OPTIONAL in V2 (V1 marked required but its
 * mega-route only filters when set). CSV-or-array via `parseCsvList`.
 * At least one parsed address must match at least one of the message's
 * `toRecipients[]` addresses. Empty parsed list → treated as no filter
 * (whitespace-only CSV passes through silently).
 */
function shouldFireEmailSent(
  message: GraphMessage,
  rawConfig: Readonly<Record<string, unknown>>,
): boolean {
  const filter = EmailSentTriggerFilterSchema.parse(
    extractEmailSentFilterFields(rawConfig),
  );

  // `to` filter — CSV-or-array; require any-of-many match.
  if (filter.to !== undefined) {
    const expectedAddresses = parseCsvList(filter.to).map((a) =>
      a.toLowerCase(),
    );
    if (expectedAddresses.length > 0) {
      const actualAddresses = (message.toRecipients ?? [])
        .map((r) => r.emailAddress?.address?.toLowerCase().trim() ?? "")
        .filter((a) => a.length > 0);
      const hasMatch = expectedAddresses.some((e) =>
        actualAddresses.includes(e),
      );
      if (!hasMatch) return false;
    }
  }

  // `subject` filter — exact OR substring per subjectExactMatch.
  if (filter.subject !== undefined && filter.subject.length > 0) {
    const expected = filter.subject.toLowerCase().trim();
    const actual = (message.subject ?? "").toLowerCase().trim();
    if (filter.subjectExactMatch) {
      if (actual !== expected) return false;
    } else {
      if (!actual.includes(expected)) return false;
    }
  }

  return true;
}

/**
 * Apply the email_flagged receive-time check. Returns `false` when the
 * message should be dropped — typically because it's no longer flagged
 * (the trigger watches `changeType: updated` on /me/messages so it
 * receives every message-edit notification; only the flagged ones
 * should fire).
 *
 * D-OM4 V1-parity over-fire: ANY update that leaves the message in a
 * flagged state fires the trigger. No prior-state cache. Subject edits
 * + body updates on already-flagged messages will re-fire.
 *
 * Defensive: if Graph omits the `flag` field on the envelope but the
 * message IS flagged at Outlook-server-side, this returns `true` rather
 * than silently dropping. Schema parse only validates the filter
 * subset (currently just `folder`); no flag-status field comes from
 * config.
 */
function shouldFireEmailFlagged(
  message: GraphMessage,
  rawConfig: Readonly<Record<string, unknown>>,
): boolean {
  // Schema parse establishes the filter is well-formed; folder routing
  // happens at activation time so there's nothing to filter here from
  // config. The schema parse acts as a strict-mode guard against future
  // typo'd field names ending up in trigger config.
  EmailFlaggedTriggerFilterSchema.parse(
    extractEmailFlaggedFilterFields(rawConfig),
  );

  // D-OM4 receive-time check.
  const flagStatus = message.flag?.flagStatus;
  if (flagStatus === undefined) {
    // Defensive: Graph omitted the flag field on the envelope. Don't
    // drop — fire and let the workflow author decide. Better to
    // over-fire than silently swallow a legitimate flagged event.
    console.warn(
      JSON.stringify({
        event: "webhook.outlook.email_flagged_missing_flag_field",
        messageId: message.id,
      }),
    );
    return true;
  }
  if (flagStatus !== "flagged") {
    // Update was unrelated to flag state (or the message was unflagged).
    return false;
  }
  return true;
}
