import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder-facing metadata for `calendly:event_canceled` — Slice
 * 5.CALENDLY-1.
 *
 * Webhook-activated. Activation creates one user-scoped Calendly
 * webhook subscription (`POST /webhook_subscriptions`, events
 * `["invitee.canceled"]`) with a V2-minted per-subscription signing key
 * (encrypted at rest). Low risk — observational.
 *
 * `payloadShape` = the eventScheduled shape + the `cancellation` object.
 * RESCHEDULES fire this trigger too (Calendly emits invitee.canceled
 * with rescheduled: true for the old booking) — workflows that only
 * care about true cancellations branch on `rescheduled`.
 */
export const calendlyEventCanceledTriggerMeta: TriggerMeta = {
  key: "calendly:event_canceled",
  provider: "calendly",
  type: "event_canceled",
  displayName: "Meeting Canceled",
  description:
    "Fires when a Calendly meeting is canceled, by the host or the invitee. Also fires for the canceled half of a reschedule (the rescheduled flag identifies those). The event carries the invitee, the meeting, and who canceled with their reason.",
  category: "scheduling",
  activation: "webhook",
  requiresIntegration: true,
  fields: [
    {
      name: "eventTypeId",
      label: "Event type",
      description:
        "Only fire for cancellations of this event type. Leave empty to fire for all event types.",
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
      description: "Always 'event_canceled'.",
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
      description: "Id of the canceled meeting.",
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
      description: "Invitee status ('canceled' after cancellation).",
      nullable: true,
    },
    {
      name: "meetingName",
      type: "string",
      description: "Name of the canceled meeting.",
      nullable: true,
    },
    {
      name: "startTime",
      type: "string",
      description: "Meeting start the booking had (ISO 8601, UTC).",
      nullable: true,
    },
    {
      name: "endTime",
      type: "string",
      description: "Meeting end the booking had (ISO 8601, UTC).",
      nullable: true,
    },
    {
      name: "location",
      type: "object",
      description:
        "Meeting location: type, location text, and join URL when it was a web conference.",
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
        "True when this cancellation is the old half of a reschedule (a new booking follows).",
    },
    {
      name: "oldInviteeId",
      type: "string",
      description: "Previous invitee id when part of a reschedule chain.",
      nullable: true,
    },
    {
      name: "newInviteeId",
      type: "string",
      description: "Replacement invitee id when this cancellation was a reschedule.",
      nullable: true,
    },
    {
      name: "cancelUrl",
      type: "string",
      description:
        "The booking's cancel link. Anyone holding this link could cancel the meeting.",
      nullable: true,
      sensitive: true,
    },
    {
      name: "rescheduleUrl",
      type: "string",
      description:
        "The booking's reschedule link. Anyone holding this link can rebook the meeting.",
      nullable: true,
      sensitive: true,
    },
    {
      name: "cancellation",
      type: "object",
      description:
        "Who canceled and why: canceledBy (name), reason, cancelerType ('host' or 'invitee').",
      nullable: true,
      sensitive: true,
    },
  ],
  displayOrder: 20,
};
