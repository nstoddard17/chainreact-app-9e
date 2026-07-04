import type { CalendlyWebhookEvent } from "@/integrations/_shared/calendly/api/webhookSubscriptions";

/**
 * Calendly trigger ↔ provider-event mapping — Slice 5.CALENDLY-1.
 *
 * Calendly webhook deliveries carry the provider event name in the
 * envelope's `event` field. The 2 V2 triggers map 1:1 to provider
 * events; each trigger node's subscription is created with EXACTLY its
 * own event, so the receive-side classification is defense-in-depth
 * (mirrors Asana's eventMap posture).
 *
 *   - `event_scheduled` ← `invitee.created`  (someone booked a meeting;
 *     also the "new booking" half of a reschedule — payload
 *     `rescheduled` / `oldInviteeId` distinguish).
 *   - `event_canceled`  ← `invitee.canceled` (a meeting was canceled;
 *     also the "cancel" half of a reschedule — payload
 *     `rescheduled: true` distinguishes).
 */

export type CalendlyTriggerType = "event_scheduled" | "event_canceled";

export const CALENDLY_TRIGGER_TYPES: readonly CalendlyTriggerType[] = [
  "event_scheduled",
  "event_canceled",
];

/** Provider event to subscribe per trigger type (POST body `events`). */
export const PROVIDER_EVENT_BY_TRIGGER: Readonly<
  Record<CalendlyTriggerType, CalendlyWebhookEvent>
> = Object.freeze({
  event_scheduled: "invitee.created",
  event_canceled: "invitee.canceled",
});

/**
 * Classify an inbound envelope `event` into a V2 trigger type, or null
 * when the event is not one V2 dispatches (routing form submissions,
 * no-show marks, future event families).
 */
export function classifyCalendlyEvent(
  envelopeEvent: unknown,
): CalendlyTriggerType | null {
  if (envelopeEvent === "invitee.created") return "event_scheduled";
  if (envelopeEvent === "invitee.canceled") return "event_canceled";
  return null;
}
