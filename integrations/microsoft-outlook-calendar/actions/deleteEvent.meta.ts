import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder metadata for `microsoft-outlook-calendar:delete_event` —
 * Slice 4.OUTLOOK-CAL-META-2. Mirrors `deleteEvent.schema.ts`.
 *
 * **Risk: high + destructive + requiresConfirmation (Marcus decision).**
 * Microsoft Graph automatically notifies attendees of the cancellation
 * per the tenant's mail-flow policy; there is NO caller-side knob to
 * suppress (contrast GCal's Q11 sendNotifications). The handler's
 * `alreadyMissing` 404 short-circuit makes the action idempotent on
 * retry — it does NOT make it non-destructive. Mirrors GCal
 * `delete_event` / OneDrive `delete_item` / Airtable `delete_record`.
 *
 * No resolver wiring: `eventId` typeable text (events resolver
 * deferred). No output is PII-bearing, so none is marked sensitive.
 */
export const microsoftOutlookCalendarDeleteEventMeta: ActionMeta = {
  key: "microsoft-outlook-calendar:delete_event",
  provider: "microsoft-outlook-calendar",
  type: "delete_event",
  displayName: "Delete Event",
  description:
    "Delete an event from your Outlook Calendar. Attendees may receive a cancellation email per your tenant's mail-flow policy.",
  category: "calendar",
  requiresIntegration: true,
  fields: [
    {
      name: "eventId",
      label: "Event Id",
      description: "The event to delete. Often comes from a trigger or List Events.",
      type: "text",
      required: true,
      placeholder: "{{trigger.eventId}}",
    },
  ],
  outputs: [
    { name: "eventId", type: "string", description: "The deleted event id." },
    { name: "deleted", type: "boolean", description: "True once the delete succeeded." },
    {
      name: "alreadyMissing",
      type: "boolean",
      description: "True if the event was already gone (idempotent delete).",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: true,
  requiresConfirmation: true,
  displayOrder: 40,
  riskLevel: "high",
  riskDescription:
    "Permanently deletes the event. Microsoft Graph notifies attendees of the cancellation per your Outlook tenant's mail-flow policy — there is no caller-side knob to suppress. There is no restore path through this action.",
};
