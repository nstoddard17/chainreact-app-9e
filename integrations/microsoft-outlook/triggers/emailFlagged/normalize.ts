import type { TriggerEvent } from "@/contracts/triggerEvent";
import type { GraphMessage } from "../../api/getMessage";

/**
 * Convert a Microsoft Graph message + the originating notification
 * envelope into the canonical V2 TriggerEvent shape for the
 * `email_flagged` trigger.
 *
 * The receive route has already verified `flag.flagStatus === "flagged"`
 * before invoking this normalize — payload's `flag.flagStatus` is
 * therefore guaranteed `"flagged"` and surfaced for downstream
 * variable references like `{{node.flag.flagStatus}}`.
 *
 * Differs from `new_email` / `email_sent` normalize in:
 *   - `eventType` = "email_flagged"
 *   - `occurredAt` fallback prefers `lastModifiedDateTime` (flag changes
 *     are message updates; lastModifiedDateTime reflects when the
 *     update happened, including the flag set).
 *   - Payload includes a `flag` block (flagStatus + completed/due/start
 *     dateTimes flattened to ISO strings).
 *
 * Dedup key shape: `${subscriptionId}:${messageId}:${changeType}` —
 * changeType is always `"updated"` for this trigger. Duplicate
 * notifications for the same flag-set transition collapse via
 * `webhook_event_dedup`.
 */

export interface NormalizeContext {
  subscriptionId: string;
  changeType: string;
  notificationOccurredAt: string;
  accountId: string;
}

interface AddressShape {
  name: string;
  address: string;
}

function addr(
  field:
    | { emailAddress?: { name?: string; address?: string } }
    | undefined,
): AddressShape | null {
  const ea = field?.emailAddress;
  if (!ea?.address) return null;
  return { name: ea.name ?? "", address: ea.address };
}

function addrList(
  fields:
    | Array<{ emailAddress?: { name?: string; address?: string } }>
    | undefined,
): AddressShape[] {
  if (!fields) return [];
  const out: AddressShape[] = [];
  for (const f of fields) {
    const a = addr(f);
    if (a) out.push(a);
  }
  return out;
}

function normalizeContentType(raw: unknown): "html" | "text" {
  if (typeof raw !== "string") return "text";
  const lower = raw.toLowerCase();
  return lower === "html" ? "html" : "text";
}

function flattenDateTime(
  field:
    | { dateTime?: string; timeZone?: string }
    | undefined,
): string | null {
  return field?.dateTime ?? null;
}

export function normalize(
  message: GraphMessage,
  context: NormalizeContext,
): TriggerEvent {
  const eventId = `${context.subscriptionId}:${message.id}:${context.changeType}`;

  const fromField = addr(message.from) ?? addr(message.sender);

  return {
    provider: "microsoft-outlook",
    eventType: "email_flagged",
    eventId,
    occurredAt:
      message.lastModifiedDateTime ??
      message.receivedDateTime ??
      message.sentDateTime ??
      context.notificationOccurredAt,
    accountId: context.accountId,
    payload: {
      messageId: message.id,
      conversationId: message.conversationId ?? null,
      subject: message.subject ?? "",
      bodyPreview: message.bodyPreview ?? "",
      body: {
        contentType: normalizeContentType(message.body?.contentType),
        content: message.body?.content ?? "",
      },
      from: fromField,
      to: addrList(message.toRecipients),
      cc: addrList(message.ccRecipients),
      receivedDateTime: message.receivedDateTime ?? null,
      hasAttachments: message.hasAttachments ?? false,
      importance: message.importance ?? "normal",
      webLink: message.webLink ?? null,
      flag: {
        // Guaranteed "flagged" by the receive-time filter, but we re-
        // read here defensively in case the upstream protocol relaxes.
        flagStatus: message.flag?.flagStatus ?? "flagged",
        completedDateTime: flattenDateTime(message.flag?.completedDateTime),
        dueDateTime: flattenDateTime(message.flag?.dueDateTime),
        startDateTime: flattenDateTime(message.flag?.startDateTime),
      },
    },
  };
}
