import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder metadata for `microsoft-outlook-calendar:add_attendees` —
 * Slice 4.OUTLOOK-CAL-META-2. Mirrors `addAttendees.schema.ts`. Write
 * action (medium risk — recoverable).
 *
 * MERGE semantics (read-modify-write): the runtime GETs the event,
 * computes a case-insensitive email diff against the existing attendee
 * list, and PATCHes the merged list. Workflow authors who want to
 * REPLACE the attendee list should use Update Event instead.
 *
 * Q11: `attendeeType` is required (`required` vs `optional`) —
 * Microsoft Graph distinguishes these in the calendar grid (different
 * UI affordance for invitees).
 *
 * Resolver wiring (RESOLVERS-2): `eventId` →
 * `microsoft-outlook-calendar:events` (no `dependsOn` — this action has no
 * `calendarId` field; it addresses /me/events, the default calendar).
 * `allowManualEntry` keeps trigger/upstream-fed ids working. Sensitive
 * outputs: `attendeesAdded` + `attendeesAlreadyPresent` (email-string arrays).
 */
export const microsoftOutlookCalendarAddAttendeesMeta: ActionMeta = {
  key: "microsoft-outlook-calendar:add_attendees",
  provider: "microsoft-outlook-calendar",
  type: "add_attendees",
  displayName: "Add Attendees",
  description:
    "Add attendees to an existing Outlook Calendar event without replacing the current ones. Already-invited addresses are skipped (case-insensitive dedup).",
  category: "calendar",
  requiresIntegration: true,
  fields: [
    {
      name: "eventId",
      label: "Event",
      description:
        "The event to add attendees to. Pick one from your calendar, or map it from an earlier step or the trigger.",
      type: "combobox",
      optionsSource: "microsoft-outlook-calendar:events",
      allowManualEntry: true,
      required: true,
      placeholder: "Search events or use {{trigger.eventId}}",
    },
    {
      name: "attendees",
      sensitivity: "recipient",
      label: "Attendees To Add",
      description:
        "Email addresses to add. Already-invited addresses are skipped automatically (case-insensitive).",
      type: "string-array",
      required: true,
      placeholder: "person@example.com",
    },
    {
      name: "attendeeType",
      label: "Attendee Type",
      description:
        "How the new attendees appear on the event. Required attendees are mandatory invitees; optional attendees are FYI invitees.",
      type: "select",
      required: true,
      options: [
        { value: "required", label: "Required" },
        { value: "optional", label: "Optional" },
      ],
    },
  ],
  outputs: [
    { name: "id", type: "string", description: "The event id." },
    {
      name: "attendeesAdded",
      type: "array",
      description: "Email addresses that were newly added.",
      sensitive: true,
    },
    { name: "attendeesTotal", type: "number", description: "Total attendees after the merge." },
    {
      name: "attendeesAlreadyPresent",
      type: "array",
      description: "Email addresses that were already on the event.",
      sensitive: true,
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 50,
  riskLevel: "medium",
  riskDescription: "Adds attendees to an event and may email invitations (recoverable — remove them via Update Event).",
};
