import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder metadata for `google-calendar:delete_event` — Slice 4.GCAL-META-2.
 * Mirrors `deleteEvent.schema.ts`.
 *
 * **Risk: high + destructive + requiresConfirmation (Marcus decision).**
 * Deleting an event is irreversible through this action, and (per Send
 * Cancellations) attendees may receive cancellation emails. Mirrors the
 * Airtable `delete_record` / Excel `delete_row` / OneDrive `delete_item`
 * destructive trio. The runtime's `alreadyDeleted` short-circuit makes the
 * delete idempotent on retry — it does NOT make it non-destructive.
 *
 * No resolver wiring: `calendarId` typeable text (default "primary");
 * `eventId` typeable text (commonly trigger/upstream-fed). No output is
 * attendee/body-bearing, so none is marked sensitive.
 */
export const googleCalendarDeleteEventMeta: ActionMeta = {
  key: "google-calendar:delete_event",
  provider: "google-calendar",
  type: "delete_event",
  displayName: "Delete Event",
  description:
    "Delete an event from a Google Calendar. Attendees may receive a cancellation email.",
  category: "calendar",
  requiresIntegration: true,
  fields: [
    {
      name: "calendarId",
      label: "Calendar",
      description: 'Calendar that holds the event. Defaults to "primary".',
      type: "text",
      required: false,
      defaultValue: "primary",
      placeholder: "primary",
    },
    {
      name: "eventId",
      label: "Event Id",
      description: "The event to delete. Often comes from a trigger or List Events.",
      type: "text",
      required: true,
      placeholder: "{{trigger.eventId}}",
    },
    {
      name: "sendNotifications",
      label: "Send Cancellations",
      description: "Who receives event-cancellation emails.",
      type: "select",
      required: true,
      options: [
        { value: "all", label: "All guests" },
        { value: "externalOnly", label: "External guests only" },
        { value: "none", label: "No one" },
      ],
    },
  ],
  outputs: [
    { name: "eventId", type: "string", description: "The deleted event id." },
    { name: "deleted", type: "boolean", description: "True once the delete succeeded." },
    {
      name: "alreadyDeleted",
      type: "boolean",
      description: "True if the event was already gone (idempotent delete).",
    },
    { name: "deletedAt", type: "string", description: "ISO-8601 timestamp of the delete." },
    { name: "eventTitle", type: "string", description: "The deleted event's title (or null)." },
    { name: "eventStart", type: "object", description: "The deleted event's start (or null)." },
    { name: "eventEnd", type: "object", description: "The deleted event's end (or null)." },
    { name: "calendarId", type: "string", description: "The calendar that was modified." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: true,
  requiresConfirmation: true,
  displayOrder: 40,
  riskLevel: "high",
  riskDescription:
    "Permanently deletes the event; attendees may receive cancellation emails. There is no restore path through this action.",
};
