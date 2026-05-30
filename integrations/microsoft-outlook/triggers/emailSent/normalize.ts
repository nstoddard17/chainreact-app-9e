import type { TriggerEvent } from "@/contracts/triggerEvent";
import type { GraphMessage } from "../../api/getMessage";

/**
 * Convert a Microsoft Graph message + the originating notification
 * envelope into the canonical V2 TriggerEvent shape for the
 * `email_sent` trigger.
 *
 * Differs from `new_email`'s normalize in:
 *   - `eventType` = "email_sent" (vs "new_email")
 *   - `occurredAt` fallback chain prefers `sentDateTime` over
 *     `receivedDateTime` (sent mail doesn't have a "received" time —
 *     it's the same as sentDateTime in the SentItems folder, but
 *     V2 prefers the more semantically-appropriate field).
 *   - Payload includes `sentDateTime` + `bcc[]` (V1 surfaces bcc on
 *     sent mail; the new_email trigger doesn't because incoming bcc
 *     is opaque to the recipient).
 *   - Payload does NOT include `receivedDateTime`.
 *
 * Dedup key (`(provider, eventId)` for `webhook_event_dedup`):
 *   `${subscriptionId}:${messageId}:${changeType}`
 *
 * `email_sent` and `new_email` cannot collide because the subscriptionId
 * differs (each lifecycle creates a distinct Graph subscription per
 * workflow).
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

export function normalize(
  message: GraphMessage,
  context: NormalizeContext,
): TriggerEvent {
  const eventId = `${context.subscriptionId}:${message.id}:${context.changeType}`;

  const fromField = addr(message.from) ?? addr(message.sender);

  return {
    provider: "microsoft-outlook",
    eventType: "email_sent",
    eventId,
    occurredAt:
      message.sentDateTime ??
      message.lastModifiedDateTime ??
      message.receivedDateTime ??
      context.notificationOccurredAt,
    providerAccountId: context.accountId,
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
      bcc: addrList(message.bccRecipients),
      sentDateTime: message.sentDateTime ?? null,
      hasAttachments: message.hasAttachments ?? false,
      importance: message.importance ?? "normal",
      webLink: message.webLink ?? null,
    },
  };
}
