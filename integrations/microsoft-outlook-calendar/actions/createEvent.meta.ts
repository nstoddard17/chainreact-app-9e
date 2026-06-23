import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder metadata for `microsoft-outlook-calendar:create_event` —
 * Slice 4.OUTLOOK-CAL-META-2. Mirrors `createEvent.schema.ts`. Write
 * action (medium risk — recoverable via Delete Event).
 *
 * Approach-A flat-time-fields shim (see schema docstring): the meta
 * exposes 4 flat fields (`startDateTime`, `startTimeZone`,
 * `endDateTime`, `endTimeZone`) that the schema's preprocess normalizes
 * to the canonical nested `{start, end}` shape. The handler is
 * unchanged. Direct API consumers can still pass the nested shape.
 *
 * No resolver wiring: there is no `calendarId` field anywhere (actions
 * are hardcoded to `/me/events`), so the `microsoft-outlook-calendar:
 * calendars` resolver is rejected (no consumer). Q11 enforces explicit
 * `isAllDay` + `responseRequested` + `bodyContentType-when-body-present`.
 *
 * Sensitive outputs: `attendees` (email PII), `organizer` (organizer
 * email PII) — both kept as flat array/object (no nested `fields[]`).
 */
export const microsoftOutlookCalendarCreateEventMeta: ActionMeta = {
  key: "microsoft-outlook-calendar:create_event",
  provider: "microsoft-outlook-calendar",
  type: "create_event",
  displayName: "Create Event",
  description: "Create a new event on your Outlook Calendar primary calendar.",
  category: "calendar",
  requiresIntegration: true,
  fields: [
    {
      name: "subject",
      label: "Title",
      description: "Event title (Graph accepts an empty subject).",
      type: "text",
      required: true,
      placeholder: "Team sync",
    },
    {
      name: "startDateTime",
      label: "Start Date-Time",
      description: "Event start (local wall-clock; the Start Time Zone applies).",
      type: "datetime",
      required: true,
    },
    {
      name: "startTimeZone",
      label: "Start Time Zone",
      description: "IANA time zone for the start time. Defaults to UTC when empty.",
      type: "timezone",
      required: false,
      placeholder: "Default (UTC)",
    },
    {
      name: "endDateTime",
      label: "End Date-Time",
      description: "Event end (local wall-clock; the End Time Zone applies).",
      type: "datetime",
      required: true,
    },
    {
      name: "endTimeZone",
      label: "End Time Zone",
      description: "IANA time zone for the end time. Defaults to UTC when empty.",
      type: "timezone",
      required: false,
      placeholder: "Default (UTC)",
    },
    {
      name: "isAllDay",
      label: "All Day",
      description:
        "When on, Outlook treats this as an all-day event. Microsoft Graph requires all-day events to start/end at midnight in the event time zone — set times accordingly.",
      type: "boolean",
      required: true,
    },
    {
      name: "responseRequested",
      label: "Request RSVP",
      description: "When on, attendees see RSVP buttons in the invitation email.",
      type: "boolean",
      required: true,
    },
    {
      name: "body",
      label: "Body",
      description: "Event body. Required Body Format below when this is set.",
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
        "Event location. Start typing for address suggestions, or type any free-text place. Graph stores it as the location displayName.",
      type: "location",
      required: false,
    },
    {
      name: "attendees",
      label: "Attendees",
      description:
        "Attendee email addresses to invite. All new attendees are added as required — use Add Attendees to invite optional attendees.",
      type: "string-array",
      required: false,
      sensitivity: "recipient",
      placeholder: "person@example.com",
    },
    {
      name: "reminderMinutesBeforeStart",
      label: "Reminder (Minutes Before Start)",
      description: "Reminder minutes before the event starts. Omit for tenant default.",
      type: "number",
      required: false,
      numeric: { min: 0, integer: true },
    },
    {
      name: "showAs",
      label: "Show As",
      description: "How the event appears on your calendar.",
      type: "select",
      required: false,
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
      options: [
        { value: "low", label: "Low" },
        { value: "normal", label: "Normal" },
        { value: "high", label: "High" },
      ],
    },
  ],
  outputs: [
    { name: "id", type: "string", description: "The created event id." },
    { name: "subject", type: "string", description: "The event title." },
    { name: "start", type: "object", description: "Event start (dateTime + timeZone)." },
    { name: "end", type: "object", description: "Event end (dateTime + timeZone)." },
    { name: "isAllDay", type: "boolean", description: "Whether the event is all-day." },
    { name: "webLink", type: "string", description: "Outlook UI link to the event (or null)." },
    {
      name: "organizer",
      type: "object",
      description: "The event organizer (name + email address).",
      sensitive: true,
    },
    {
      name: "attendees",
      type: "array",
      description: "Attendees on the event (each carries an email address).",
      sensitive: true,
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 10,
  riskLevel: "medium",
  riskDescription: "Creates an Outlook calendar event and may email invitations (recoverable — delete the event to undo).",
};
