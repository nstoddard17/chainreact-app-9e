import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder metadata for `google-calendar:create_event` — Slice 4.GCAL-META-2.
 * Mirrors `createEvent.schema.ts`. Write action (medium risk — recoverable
 * via Delete Event).
 *
 * No resolver wiring: `calendarId` ships as typeable text defaulting to
 * "primary" (the `calendars` picker is scope-blocked — see
 * docs/slices/phase-4/google-calendar-metadata-coverage-plan.md §3).
 * `attendees` is a free-text email list (runtime routes it through Q7
 * `parseRecipients`). Q11 forces `sendNotifications` /
 * `guestsCanInviteOthers` / `guestsCanSeeOtherGuests` to be explicit.
 *
 * Sensitive outputs: `attendees` (attendee email PII) + `meetLink` (the
 * access-bearing Google Meet join URL — Marcus decision).
 */
export const googleCalendarCreateEventMeta: ActionMeta = {
  key: "google-calendar:create_event",
  provider: "google-calendar",
  type: "create_event",
  displayName: "Create Event",
  description: "Create a new event on a Google Calendar.",
  category: "calendar",
  requiresIntegration: true,
  fields: [
    {
      name: "calendarId",
      label: "Calendar",
      description:
        'Calendar to create the event on. Pick from your calendars, or paste a calendar id (e.g. you@gmail.com). Defaults to "primary".',
      type: "combobox",
      optionsSource: "google-calendar:calendars",
      allowManualEntry: true,
      required: false,
      defaultValue: "primary",
      placeholder: "Search calendars or paste an ID",
    },
    {
      name: "summary",
      label: "Title",
      description: "The event title.",
      type: "text",
      required: true,
      placeholder: "Team sync",
    },
    {
      name: "description",
      label: "Description",
      description: "Event description / notes.",
      type: "textarea",
      required: false,
    },
    {
      name: "location",
      label: "Location",
      description:
        "Event location. Start typing for address suggestions, or type any free-text place. Stored as the formatted address string.",
      type: "location",
      required: false,
    },
    {
      name: "allDay",
      label: "All Day",
      description:
        "When on, the event covers whole days (date-only). When off, it has exact start and end times.",
      type: "boolean",
      required: false,
      defaultValue: false,
    },
    // GOOGLE-REVIEW-CERTIFICATION-2 — required-WHEN-VISIBLE (CONFIG-UX-SETUP-ADVANCED-1).
    // `createEvent.schema.ts` superRefine REQUIRES startDateTime + endDateTime when allDay is
    // false, and startDate + endDate when it is true. Declaring all four `required: false` made
    // readiness permit a configuration the runtime then rejects — the node showed no Setup Needed
    // and failed mid-run instead. Each pair is now `required: true` scoped by its existing
    // top-level `visibleWhen`, so `missingRequiredFields` flags exactly the pair the current
    // All Day mode reveals and NEVER the hidden pair. No `defaultValue` is added: a guessed
    // date/time is worse than an explicit gap.
    {
      name: "startDateTime",
      label: "Start Date-Time",
      description: "Event start. Required unless All Day is on.",
      type: "datetime",
      required: true,
      visibleWhen: { field: "allDay", valueTruthy: false },
    },
    {
      name: "endDateTime",
      label: "End Date-Time",
      description: "Event end. Required unless All Day is on.",
      type: "datetime",
      required: true,
      visibleWhen: { field: "allDay", valueTruthy: false },
    },
    {
      name: "startDate",
      label: "Start Date",
      description: "All-day start. Required when All Day is on.",
      type: "date",
      required: true,
      visibleWhen: { field: "allDay", valueTruthy: true },
    },
    {
      name: "endDate",
      label: "End Date",
      description:
        "All-day end (exclusive — the day after the event ends). Required when All Day is on.",
      type: "date",
      required: true,
      visibleWhen: { field: "allDay", valueTruthy: true },
    },
    {
      name: "timezone",
      label: "Time Zone",
      description: "IANA time zone for timed events. Defaults to UTC when empty.",
      type: "timezone",
      required: false,
      placeholder: "Default (UTC)",
    },
    {
      name: "attendees",
      label: "Attendees",
      description: "Attendee email addresses to invite.",
      type: "string-array",
      required: false,
      sensitivity: "recipient",
      placeholder: "person@example.com",
    },
    {
      name: "googleMeet",
      label: "Add Google Meet",
      description: "When on, attaches a Google Meet conference to the event.",
      type: "boolean",
      required: false,
      defaultValue: false,
    },
    {
      name: "sendNotifications",
      label: "Send Invitations",
      description: "Who receives event invitation emails.",
      type: "select",
      required: true,
      options: [
        { value: "all", label: "All guests" },
        { value: "externalOnly", label: "External guests only" },
        { value: "none", label: "No one" },
      ],
    },
    {
      name: "guestsCanInviteOthers",
      label: "Guests Can Invite Others",
      description: "Allow attendees to invite additional guests.",
      type: "boolean",
      required: true,
    },
    {
      name: "guestsCanSeeOtherGuests",
      label: "Guests Can See Other Guests",
      description: "Allow attendees to see the full guest list.",
      type: "boolean",
      required: true,
    },
    {
      name: "guestsCanModify",
      label: "Guests Can Modify",
      description: "Allow attendees to edit the event.",
      type: "boolean",
      required: false,
    },
    {
      name: "visibility",
      label: "Visibility",
      description: "Event visibility.",
      type: "select",
      required: false,
      options: [
        { value: "default", label: "Default" },
        { value: "public", label: "Public" },
        { value: "private", label: "Private" },
        { value: "confidential", label: "Confidential" },
      ],
    },
    {
      name: "transparency",
      label: "Show As",
      description: "Whether the event blocks time on the calendar.",
      type: "select",
      required: false,
      options: [
        { value: "opaque", label: "Busy" },
        { value: "transparent", label: "Free" },
      ],
    },
    {
      name: "colorId",
      label: "Color",
      description: "Event color shown on the calendar.",
      type: "select",
      required: false,
      options: [
        { value: "1", label: "Lavender (1)" },
        { value: "2", label: "Sage (2)" },
        { value: "3", label: "Grape (3)" },
        { value: "4", label: "Flamingo (4)" },
        { value: "5", label: "Banana (5)" },
        { value: "6", label: "Tangerine (6)" },
        { value: "7", label: "Peacock (7)" },
        { value: "8", label: "Graphite (8)" },
        { value: "9", label: "Blueberry (9)" },
        { value: "10", label: "Basil (10)" },
        { value: "11", label: "Tomato (11)" },
      ],
    },
  ],
  outputs: [
    { name: "eventId", type: "string", description: "The created event id." },
    { name: "htmlLink", type: "string", description: "Calendar UI link to the event (or null).", nullable: true },
    { name: "summary", type: "string", description: "The event title." },
    { name: "start", type: "object", description: "Event start (date or dateTime + timeZone; or null).", nullable: true },
    { name: "end", type: "object", description: "Event end (date or dateTime + timeZone; or null).", nullable: true },
    {
      name: "attendees",
      type: "array",
      description: "Attendees on the event (each carries an email address).",
      sensitive: true,
    },
    {
      name: "meetLink",
      type: "string",
      description: "Google Meet join URL (or null).",
      sensitive: true,
      nullable: true,
    },
    { name: "status", type: "string", description: "Event status (confirmed / tentative / cancelled; or null).", nullable: true },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 10,
  riskLevel: "medium",
  riskDescription: "Creates a calendar event and may email invitations (recoverable — delete the event to undo).",
};
