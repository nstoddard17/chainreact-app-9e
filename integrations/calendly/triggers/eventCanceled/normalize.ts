import type { TriggerEvent } from "@/contracts/triggerEvent";
import {
  projectInvitee,
  type CalendlyWebhookEnvelope,
} from "../_shared/project";

/**
 * Normalize a Calendly `invitee.canceled` delivery into V2's canonical
 * `TriggerEvent` — Slice 5.CALENDLY-1.
 *
 * PURE + deterministic dedup key — see eventScheduled/normalize.ts for
 * the full key rationale (subscriber-scoped invitee identity; the
 * canceled key never collides with the scheduled key because the type
 * prefix differs and Calendly cancels the SAME invitee that was
 * created).
 *
 * Dedup key: `event_canceled:${subscriberUserId}:${inviteeUuid}`.
 *
 * RESCHEDULES fire this trigger too: Calendly emits `invitee.canceled`
 * with `rescheduled: true` for the old booking, then `invitee.created`
 * for the new one. Users who only care about true cancellations branch
 * on the `rescheduled` payload field (documented in the meta).
 *
 * Adds the `cancellation` projection (`canceledBy`, `reason`,
 * `cancelerType` — "host" | "invitee") on top of the shared bounded
 * invitee projection.
 */
export function normalizeEventCanceled(
  ev: CalendlyWebhookEnvelope,
  ctx: { subscriberUserId: string | null },
): TriggerEvent {
  const projected = projectInvitee(ev.payload);
  const subscriber = ctx.subscriberUserId ?? "no-user";
  const occurredAt =
    ev.created_at ?? ev.payload?.created_at ?? new Date().toISOString();

  const eventId = projected.inviteeId
    ? `event_canceled:${subscriber}:${projected.inviteeId}`
    : `event_canceled:${subscriber}:no-invitee:${ev.created_at ?? "no-timestamp"}`;

  const rawCancellation = ev.payload?.cancellation ?? null;
  const cancellation = rawCancellation
    ? {
        canceledBy:
          typeof rawCancellation.canceled_by === "string"
            ? rawCancellation.canceled_by
            : null,
        reason:
          typeof rawCancellation.reason === "string"
            ? rawCancellation.reason
            : null,
        cancelerType:
          typeof rawCancellation.canceler_type === "string"
            ? rawCancellation.canceler_type
            : null,
      }
    : null;

  return {
    provider: "calendly",
    eventType: "event_canceled",
    eventId,
    occurredAt,
    providerAccountId: ctx.subscriberUserId ?? "unknown",
    payload: {
      changeKind: "event_canceled",
      subscriberUserId: ctx.subscriberUserId,
      inviteeId: projected.inviteeId,
      eventId: projected.eventId,
      eventTypeId: projected.eventTypeId,
      inviteeName: projected.inviteeName,
      inviteeEmail: projected.inviteeEmail,
      inviteeTimezone: projected.inviteeTimezone,
      inviteeStatus: projected.inviteeStatus,
      meetingName: projected.meetingName,
      startTime: projected.startTime,
      endTime: projected.endTime,
      location: projected.location,
      hosts: projected.hosts,
      questionsAndAnswers: projected.questionsAndAnswers,
      tracking: projected.tracking,
      rescheduled: projected.rescheduled,
      oldInviteeId: projected.oldInviteeId,
      newInviteeId: projected.newInviteeId,
      cancelUrl: projected.cancelUrl,
      rescheduleUrl: projected.rescheduleUrl,
      cancellation,
    },
  };
}
