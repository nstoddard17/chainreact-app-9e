import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder-facing metadata for `calendly:event_scheduled` — Slice
 * 5.CALENDLY-1.
 *
 * Webhook-activated. Activation creates one user-scoped Calendly
 * webhook subscription (`POST /webhook_subscriptions`, events
 * `["invitee.created"]`) with a V2-minted per-subscription signing key
 * (encrypted at rest). Low risk — observational.
 *
 * `payloadShape` mirrors eventScheduled/normalize.ts. Invitee PII
 * (email, hosts, questions and answers) is marked `sensitive: true`
 * (Typeform answers/hidden precedent); `cancelUrl`/`rescheduleUrl` are
 * ALSO sensitive — they are capability URLs (anyone holding one can
 * cancel or rebook the meeting).
 *
 * RESCHEDULES: Calendly emits invitee.canceled (rescheduled: true) +
 * invitee.created for one reschedule, so this trigger fires for the new
 * booking. LIVE-OBSERVED (Phase 13, 2026-07-05): the NEW booking carries
 * `rescheduled: false` — `oldInviteeId` being set is what identifies the
 * new half of a reschedule (`rescheduled: true` appears only on the
 * canceled half).
 */
export const calendlyEventScheduledTriggerMeta: TriggerMeta = {
  key: "calendly:event_scheduled",
  provider: "calendly",
  type: "event_scheduled",
  displayName: "Meeting Scheduled",
  description:
    "Fires when someone books a meeting through Calendly. The event carries the invitee, meeting time, location, and event type. Also fires for the new booking of a reschedule — identified by oldInviteeId being set.",
  category: "scheduling",
  activation: "webhook",
  requiresIntegration: true,
  fields: [
    {
      name: "eventTypeId",
      label: "Event type",
      description:
        "Only fire for bookings of this event type. Leave empty to fire for all event types.",
      type: "combobox",
      optionsSource: "calendly:event_types",
      required: false,
      placeholder: "All event types",
    },
  ],
  payloadShape: [
    {
      name: "changeKind",
      type: "string",
      description: "Always 'event_scheduled'.",
    },
    {
      name: "inviteeId",
      type: "string",
      description: "Calendly's unique id for this booking's invitee.",
      nullable: true,
    },
    {
      name: "eventId",
      type: "string",
      description: "Id of the scheduled meeting.",
      nullable: true,
    },
    {
      name: "eventTypeId",
      type: "string",
      description: "Id of the event type that was booked.",
      nullable: true,
    },
    {
      name: "inviteeName",
      type: "string",
      description: "Name the invitee entered when booking.",
      nullable: true,
      sensitive: true,
    },
    {
      name: "inviteeEmail",
      type: "string",
      description: "Email the invitee entered when booking.",
      nullable: true,
      sensitive: true,
    },
    {
      name: "inviteeTimezone",
      type: "string",
      description: "Invitee's IANA timezone.",
      nullable: true,
    },
    {
      name: "inviteeStatus",
      type: "string",
      description: "Invitee status ('active' for new bookings).",
      nullable: true,
    },
    {
      name: "meetingName",
      type: "string",
      description: "Name of the scheduled meeting.",
      nullable: true,
    },
    {
      name: "startTime",
      type: "string",
      description: "Meeting start (ISO 8601, UTC).",
      nullable: true,
    },
    {
      name: "endTime",
      type: "string",
      description: "Meeting end (ISO 8601, UTC).",
      nullable: true,
    },
    {
      name: "location",
      type: "object",
      description:
        "Meeting location: type, location text, and join URL when it is a web conference.",
      nullable: true,
    },
    {
      name: "hosts",
      type: "array",
      description: "Meeting hosts: name and email per host.",
      sensitive: true,
    },
    {
      name: "questionsAndAnswers",
      type: "array",
      description:
        "Custom booking questions: question, answer, position. Empty when the event type asks none.",
      sensitive: true,
    },
    {
      name: "tracking",
      type: "object",
      description: "UTM and Salesforce tracking values from the booking link.",
      nullable: true,
    },
    {
      name: "rescheduled",
      type: "boolean",
      description:
        "Calendly's rescheduled flag for this invitee. Live-observed: the new booking of a reschedule carries false — use oldInviteeId to identify it.",
    },
    {
      name: "oldInviteeId",
      type: "string",
      description:
        "Previous invitee id — set exactly when this booking is the new half of a reschedule.",
      nullable: true,
    },
    {
      name: "newInviteeId",
      type: "string",
      description: "Replacement invitee id (set on the canceled half of a reschedule).",
      nullable: true,
    },
    {
      name: "cancelUrl",
      type: "string",
      description:
        "Link the invitee can use to cancel. Anyone holding this link can cancel the meeting.",
      nullable: true,
      sensitive: true,
    },
    {
      name: "rescheduleUrl",
      type: "string",
      description:
        "Link the invitee can use to reschedule. Anyone holding this link can rebook the meeting.",
      nullable: true,
      sensitive: true,
    },
  ],
  displayOrder: 10,
};
