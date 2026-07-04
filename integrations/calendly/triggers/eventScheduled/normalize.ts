import type { TriggerEvent } from "@/contracts/triggerEvent";
import {
  projectInvitee,
  type CalendlyWebhookEnvelope,
} from "../_shared/project";

/**
 * Normalize a Calendly `invitee.created` delivery into V2's canonical
 * `TriggerEvent` — Slice 5.CALENDLY-1.
 *
 * PURE + deterministic dedup key (enforced by
 * tests/structure/webhook-normalize-purity.test.ts): the `eventId` is
 * never derived from a clock or RNG.
 *
 * Dedup key: `event_scheduled:${subscriberUserId}:${inviteeUuid}` —
 * the invitee UUID is Calendly's stable per-booking identity (a
 * reschedule mints a NEW invitee, so created/canceled halves never
 * collide), which collapses provider redeliveries (retry-until-2xx, no
 * exactly-once guarantee) AND the per-workflow subscription fan-out
 * (N workflows for one user → N deliveries) into a single dispatch
 * round; `dispatchTriggerEvent` then fans out to all rows on
 * `(calendly, event_scheduled)` and the per-trigger filter re-narrows.
 *
 * The SUBSCRIBER user id is part of the key deliberately: collective
 * events have multiple hosts, so ONE booking can legitimately deliver
 * to two different users' subscriptions — a key without user
 * attribution would dedup the second user's delivery away and silently
 * drop their workflow run (the Asana double-fire lesson applied with
 * resource scope = subscription owner). Deliveries missing an invitee
 * URI fall back to the envelope `created_at` (payload data, not a
 * clock read) so unrelated malformed deliveries never share a key.
 *
 * Payload is a BOUNDED PROJECTION (see ../_shared/project.ts), never a
 * raw spread. Raw API URIs are reduced to UUIDs; `cancelUrl` /
 * `rescheduleUrl` are projected as invitee-facing action links (marked
 * sensitive in the meta — capability URLs); invitee PII (email, hosts,
 * Q&A) marked sensitive.
 */
export function normalizeEventScheduled(
  ev: CalendlyWebhookEnvelope,
  ctx: { subscriberUserId: string | null },
): TriggerEvent {
  const projected = projectInvitee(ev.payload);
  const subscriber = ctx.subscriberUserId ?? "no-user";
  const occurredAt =
    ev.created_at ?? ev.payload?.created_at ?? new Date().toISOString();

  const eventId = projected.inviteeId
    ? `event_scheduled:${subscriber}:${projected.inviteeId}`
    : `event_scheduled:${subscriber}:no-invitee:${ev.created_at ?? "no-timestamp"}`;

  return {
    provider: "calendly",
    eventType: "event_scheduled",
    eventId,
    occurredAt,
    providerAccountId: ctx.subscriberUserId ?? "unknown",
    payload: {
      changeKind: "event_scheduled",
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
    },
  };
}
