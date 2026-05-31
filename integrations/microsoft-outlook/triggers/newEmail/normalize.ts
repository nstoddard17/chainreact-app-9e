import type { TriggerEvent } from "@/contracts/triggerEvent";
import type { GraphMessage } from "../../api/getMessage";

/**
 * Convert a Microsoft Graph message + the originating notification
 * envelope into the canonical V2 TriggerEvent shape.
 *
 * Dedup key (`(provider, eventId)` for `webhook_event_dedup`):
 *   `${subscriptionId}:${messageId}:${changeType}`
 *
 * Slice 6 plan §"Dedup key shape":
 *   - subscriptionId distinguishes notifications that fan out to
 *     multiple subscriptions during rotation.
 *   - messageId is the Graph object id, stable per message.
 *   - changeType is always "created" in Slice 6 but included for
 *     forward-compat (Slice 7+ may add updated/deleted variants).
 *
 * Output payload mirrors the plan's "Output shape" section:
 *   - messageId, conversationId, subject, bodyPreview, body,
 *     from, to, cc, receivedAt, hasAttachments, importance, webLink.
 *   - Each recipient is normalized to `{ name, address }`. Graph's
 *     EmailAddress objects sometimes omit `name` — we coalesce to ""
 *     to keep the payload shape stable.
 *
 * Slice 6 explicitly emits the FULL body. The plan documents the
 * trade-off (large HTML emails inflate the run record) and notes a
 * follow-up `bodyPreviewOnly` config field if real workflows trip
 * storage limits.
 */

export interface NormalizeContext {
  /** Graph subscription id from the notification envelope. */
  subscriptionId: string;
  changeType: string;
  /** ISO-8601 timestamp from the notification or our receipt time. */
  notificationOccurredAt: string;
  /** Account id (email) from the integration row this trigger fired against. */
  providerAccountId: string;
}

interface AddressShape {
  name: string;
  address: string;
}

function addr(field: { emailAddress?: { name?: string; address?: string } } | undefined): AddressShape | null {
  const ea = field?.emailAddress;
  if (!ea?.address) return null;
  return { name: ea.name ?? "", address: ea.address };
}

function addrList(
  fields: Array<{ emailAddress?: { name?: string; address?: string } }> | undefined,
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
    eventType: "new_email",
    eventId,
    occurredAt:
      message.receivedDateTime ??
      message.sentDateTime ??
      context.notificationOccurredAt,
    providerAccountId: context.providerAccountId,
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
      receivedAt: message.receivedDateTime ?? null,
      hasAttachments: message.hasAttachments ?? false,
      importance: message.importance ?? "normal",
      webLink: message.webLink ?? null,
    },
  };
}
