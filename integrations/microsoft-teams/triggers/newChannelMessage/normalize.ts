import type { TriggerEvent } from "@/contracts/triggerEvent";
import type { ChatMessageResource } from "../../api/types";

/**
 * Convert a Microsoft Graph chatMessage (hydrated via id-fetch GET) into
 * the canonical V2 TriggerEvent shape.
 *
 * Dedup key (`(provider, eventId)` for `webhook_event_dedup`):
 *   `${subscriptionId}:${messageId}:created`
 *
 * Channel-message subscriptions are scoped to `changeType: "created"`
 * only — Batch 1 does not subscribe to `updated`. The `:created`
 * infix future-proofs the key against a Batch 2 expansion that adds
 * an updated-message trigger (so dedup keys won't collide across
 * change types for the same messageId).
 *
 * Output payload prioritizes downstream-variable usefulness — stable
 * across (provider, type) per the action-handler contract. The shape
 * mirrors `_normalize.ts` from the action layer where it overlaps
 * (`messageId`, `subject`, `bodyContent`, `bodyContentType`,
 * `fromUserId`, `fromUserDisplayName`, `createdDateTime`, `webUrl`),
 * adding `teamId`, `channelId`, `bodyPreview`, `importance`,
 * `replyToId`, `messageType` specific to the trigger event surface.
 */

export interface NormalizeContext {
  /** Graph subscription id from the notification envelope. */
  subscriptionId: string;
  /** teamId from the matched trigger_resources row. */
  teamId: string;
  /** channelId from the matched trigger_resources row. */
  channelId: string;
  /** ISO-8601 timestamp from the notification or our receipt time. */
  notificationOccurredAt: string;
  /** Account id (email) from the integration row this trigger fired against. */
  providerAccountId: string;
}

const CHANGE_TYPE = "created" as const;

function buildEventId(
  context: NormalizeContext,
  messageId: string,
): string {
  return `${context.subscriptionId}:${messageId}:${CHANGE_TYPE}`;
}

export function normalize(
  message: ChatMessageResource,
  context: NormalizeContext,
): TriggerEvent {
  return {
    provider: "microsoft-teams",
    eventType: "new_channel_message",
    eventId: buildEventId(context, message.id),
    occurredAt:
      message.createdDateTime ??
      message.lastModifiedDateTime ??
      context.notificationOccurredAt,
    providerAccountId: context.providerAccountId,
    payload: {
      messageId: message.id,
      teamId: context.teamId,
      channelId: context.channelId,
      subject: message.subject ?? null,
      bodyContent: message.body?.content ?? "",
      bodyContentType: message.body?.contentType ?? null,
      bodyPreview: message.summary ?? null,
      importance: message.importance ?? null,
      messageType: message.messageType ?? null,
      replyToId: message.replyToId ?? null,
      fromUserId: message.from?.user?.id ?? null,
      fromUserDisplayName: message.from?.user?.displayName ?? null,
      createdDateTime: message.createdDateTime ?? null,
      lastModifiedDateTime: message.lastModifiedDateTime ?? null,
      webUrl: message.webUrl ?? null,
      changeType: CHANGE_TYPE,
    },
  };
}
