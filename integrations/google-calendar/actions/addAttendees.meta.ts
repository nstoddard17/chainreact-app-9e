import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder metadata for `google-calendar:add_attendees` — Slice 4.GCAL-META-2.
 * Mirrors `addAttendees.schema.ts`. Write action (medium risk — recoverable).
 *
 * MERGE semantics: the runtime fetches the existing event, computes a
 * case-insensitive email diff, and patches with the union — it adds without
 * removing existing attendees (use Update Event to replace the whole list).
 *
 * Resolver wiring: `calendarId` → `google-calendar:calendars` (default
 * "primary"); `eventId` → `google-calendar:events`, a cascade child of
 * `calendarId` (RESOLVERS-2). Both keep `allowManualEntry` so
 * trigger/upstream-fed ids still work. Sensitive outputs: `attendees` (full
 * merged list — provider data), plus the `addedAttendees` / `alreadyInvited`
 * email echoes.
 */
export const googleCalendarAddAttendeesMeta: ActionMeta = {
  key: "google-calendar:add_attendees",
  provider: "google-calendar",
  type: "add_attendees",
  displayName: "Add Attendees",
  description:
    "Add attendees to an existing event without removing the current ones. Attendees already invited are skipped.",
  category: "calendar",
  requiresIntegration: true,
  fields: [
    {
      name: "calendarId",
      label: "Calendar",
      description:
        'Calendar that holds the event. Pick from your calendars, or paste a calendar id. Defaults to "primary".',
      type: "combobox",
      optionsSource: "google-calendar:calendars",
      allowManualEntry: true,
      required: false,
      defaultValue: "primary",
      placeholder: "Search calendars or paste an ID",
    },
    {
      name: "eventId",
      label: "Event",
      description:
        "The event to add attendees to. Pick one from the calendar above, or map it from an earlier step or the trigger.",
      type: "combobox",
      optionsSource: "google-calendar:events",
      dependsOn: "calendarId",
      allowManualEntry: true,
      required: true,
      placeholder: "Search events or use {{trigger.eventId}}",
    },
    {
      name: "attendees",
      sensitivity: "recipient",
      label: "Attendees To Add",
      description: "Email addresses to add. Already-invited addresses are skipped.",
      type: "string-array",
      required: true,
      placeholder: "person@example.com",
    },
    {
      name: "sendNotifications",
      label: "Send Invitations",
      description: "Who receives invitation emails for the newly added guests.",
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
    { name: "eventId", type: "string", description: "The event id." },
    { name: "actuallyAdded", type: "number", description: "Count of attendees newly added." },
    {
      name: "addedAttendees",
      type: "array",
      description: "Email addresses that were newly added.",
      sensitive: true,
    },
    {
      name: "alreadyInvited",
      type: "array",
      description: "Email addresses that were already on the event.",
      sensitive: true,
    },
    {
      name: "attendees",
      type: "array",
      description: "The full merged attendee list (each carries an email address).",
      sensitive: true,
    },
    { name: "totalAttendees", type: "number", description: "Total attendees after the merge." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 50,
  riskLevel: "medium",
  riskDescription: "Adds guests to an event and may email invitations (recoverable — remove them via Update Event).",
};
