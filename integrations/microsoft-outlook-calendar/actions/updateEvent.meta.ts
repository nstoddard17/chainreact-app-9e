import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder metadata for `microsoft-outlook-calendar:update_event` —
 * Slice 4.OUTLOOK-CAL-META-2. Mirrors `updateEvent.schema.ts`. Write
 * action (medium risk — recoverable via a follow-up patch).
 *
 * PATCH semantics: only fields you set are sent to Graph; omitted
 * fields stay unchanged. `attendees` REPLACES the entire list (use Add
 * Attendees to append without removing).
 *
 * Approach-A flat-time-fields shim — all 4 flat time fields are
 * optional here (the schema accepts partial time edits, though Graph
 * will reject one-sided updates with `ErrorInvalidArgument`). The
 * schema's "≥1 mutable field beyond eventId" refine still applies.
 *
 * No resolver wiring: `eventId` typeable text (the
 * `microsoft-outlook-calendar:events` resolver is deferred —
 * trigger/upstream-fed). Sensitive outputs: `attendees`, `organizer`.
 */
export const microsoftOutlookCalendarUpdateEventMeta: ActionMeta = {
  key: "microsoft-outlook-calendar:update_event",
  provider: "microsoft-outlook-calendar",
  type: "update_event",
  displayName: "Update Event",
  description:
    "Update fields on an existing Outlook Calendar event. Only the fields you set are changed; everything else is left untouched.",
  category: "calendar",
  requiresIntegration: true,
  fields: [
    {
      name: "eventId",
      label: "Event Id",
      description: "The event to update. Often comes from a trigger or List Events.",
      type: "text",
      required: true,
      placeholder: "{{trigger.eventId}}",
    },
    {
      name: "subject",
      label: "Title",
      description: "New event title (leave empty to keep the current one).",
      type: "text",
      required: false,
    },
    {
      name: "startDateTime",
      label: "Start Date-Time",
      description:
        "New start (local wall-clock; the Start Time Zone applies). To change times, set BOTH Start and End — Graph rejects one-sided time edits.",
      type: "datetime",
      required: false,
    },
    {
      name: "startTimeZone",
      label: "Start Time Zone",
      description: "IANA time zone for the new start time. Defaults to UTC when empty.",
      type: "timezone",
      required: false,
      placeholder: "Default (UTC)",
    },
    {
      name: "endDateTime",
      label: "End Date-Time",
      description: "New end (local wall-clock; the End Time Zone applies). Pair with Start to change times.",
      type: "datetime",
      required: false,
    },
    {
      name: "endTimeZone",
      label: "End Time Zone",
      description: "IANA time zone for the new end time. Defaults to UTC when empty.",
      type: "timezone",
      required: false,
      placeholder: "Default (UTC)",
    },
    {
      name: "isAllDay",
      label: "All Day",
      description: "Change the all-day flag.",
      type: "boolean",
      required: false,
    },
    {
      name: "responseRequested",
      label: "Request RSVP",
      description: "Change whether attendees see RSVP buttons in the invitation email.",
      type: "boolean",
      required: false,
    },
    {
      name: "body",
      label: "Body",
      description: "New event body (leave empty to keep current). Set Body Format when this is non-empty.",
      type: "textarea",
      required: false,
    },
    {
      name: "bodyContentType",
      label: "Body Format",
      description: "Required when Body is set. Choose how Outlook renders the body.",
      type: "select",
      required: false,
      options: [
        { value: "Text", label: "Plain text" },
        { value: "HTML", label: "HTML" },
      ],
    },
    {
      name: "location",
      label: "Location",
      description:
        "New event location. Start typing for address suggestions, or type any free-text place. Leave empty to keep current.",
      type: "location",
      required: false,
    },
    {
      name: "attendees",
      sensitivity: "recipient",
      label: "Attendees (Replace)",
      description:
        "Replaces the ENTIRE attendee list with these emails. To add without removing, use Add Attendees instead.",
      type: "string-array",
      required: false,
      placeholder: "person@example.com",
    },
    {
      name: "reminderMinutesBeforeStart",
      label: "Reminder (Minutes Before Start)",
      description: "Change the reminder minutes before the event starts.",
      type: "number",
      required: false,
      advanced: true,
      numeric: { min: 0, integer: true },
    },
    {
      name: "showAs",
      label: "Show As",
      description: "How the event appears on your calendar.",
      type: "select",
      required: false,
      advanced: true,
      options: [
        { value: "free", label: "Free" },
        { value: "tentative", label: "Tentative" },
        { value: "busy", label: "Busy" },
        { value: "oof", label: "Out of office" },
        { value: "workingElsewhere", label: "Working elsewhere" },
      ],
    },
    {
      name: "sensitivity",
      label: "Sensitivity",
      description: "Event sensitivity (Outlook privacy level).",
      type: "select",
      required: false,
      advanced: true,
      options: [
        { value: "normal", label: "Normal" },
        { value: "personal", label: "Personal" },
        { value: "private", label: "Private" },
        { value: "confidential", label: "Confidential" },
      ],
    },
    {
      name: "importance",
      label: "Importance",
      description: "Event importance.",
      type: "select",
      required: false,
      advanced: true,
      options: [
        { value: "low", label: "Low" },
        { value: "normal", label: "Normal" },
        { value: "high", label: "High" },
      ],
    },
  ],
  outputs: [
    { name: "id", type: "string", description: "The updated event id." },
    { name: "subject", type: "string", description: "The event title (or null).", nullable: true },
    { name: "start", type: "object", description: "Event start (dateTime + timeZone) or null.", nullable: true },
    { name: "end", type: "object", description: "Event end (dateTime + timeZone) or null.", nullable: true },
    { name: "isAllDay", type: "boolean", description: "Whether the event is all-day." },
    { name: "webLink", type: "string", description: "Outlook UI link to the event (or null).", nullable: true },
    {
      name: "organizer",
      type: "object",
      description: "The event organizer (name + email address; or null).",
      sensitive: true,
      nullable: true,
    },
    {
      name: "attendees",
      type: "array",
      description: "Attendees on the event after the patch (each carries an email address).",
      sensitive: true,
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 30,
  riskLevel: "medium",
  riskDescription: "Edits an existing Outlook calendar event and may email updates (recoverable — patch again to revert).",
};
