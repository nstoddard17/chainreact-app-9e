import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder metadata for `google-calendar:update_event` — Slice 4.GCAL-META-2.
 * Mirrors `updateEvent.schema.ts`. Write action (medium risk — recoverable
 * via a follow-up patch).
 *
 * Merge-patch semantics: only fields you set are sent to Google; omitted
 * fields stay unchanged. Time edits require BOTH start and end (the runtime
 * fails fast otherwise — the V1 `'09:00'` synthesis bug stays fixed).
 * `attendees` here REPLACES the list — use Add Attendees to add without
 * replacing.
 *
 * Resolver wiring: `calendarId` → `google-calendar:calendars` (default
 * "primary"); `eventId` → `google-calendar:events`, a cascade child of
 * `calendarId` (RESOLVERS-2). Both keep `allowManualEntry` so
 * `{{trigger.eventId}}` / upstream mapping still works. Sensitive outputs:
 * `attendees` (PII) + `description` (event body, per the GCAL-META-2
 * sensitivity decision).
 */
export const googleCalendarUpdateEventMeta: ActionMeta = {
  key: "google-calendar:update_event",
  provider: "google-calendar",
  type: "update_event",
  displayName: "Update Event",
  description:
    "Update fields on an existing Google Calendar event. Only the fields you set are changed; everything else is left untouched.",
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
        "The event to update. Pick one from the calendar above, or map it from an earlier step or the trigger.",
      type: "combobox",
      optionsSource: "google-calendar:events",
      dependsOn: "calendarId",
      allowManualEntry: true,
      required: true,
      placeholder: "Search events or use {{trigger.eventId}}",
    },
    {
      name: "summary",
      label: "Title",
      description: "New event title (leave empty to keep the current one).",
      type: "text",
      required: false,
    },
    {
      name: "description",
      label: "Description",
      description: "New description / notes (leave empty to keep the current one).",
      type: "textarea",
      required: false,
    },
    {
      name: "location",
      label: "Location",
      description:
        "New event location. Start typing for address suggestions, or type any free-text place. Leave empty to keep the current one.",
      type: "location",
      required: false,
    },
    {
      name: "startDateTime",
      label: "Start Date-Time",
      description: "New start. To change times you must set BOTH start and end.",
      type: "datetime",
      required: false,
    },
    {
      name: "endDateTime",
      label: "End Date-Time",
      description: "New end. To change times you must set BOTH start and end.",
      type: "datetime",
      required: false,
    },
    {
      name: "timezone",
      label: "Time Zone",
      description: "IANA time zone for the new times. Defaults to UTC when empty.",
      type: "timezone",
      required: false,
      placeholder: "Default (UTC)",
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
      name: "googleMeet",
      label: "Add Google Meet",
      description: "When on, adds a Google Meet conference to the event.",
      type: "boolean",
      required: false,
    },
    {
      name: "sendNotifications",
      label: "Send Updates",
      description: "Who receives event-update emails.",
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
      required: false,
    },
    {
      name: "guestsCanSeeOtherGuests",
      label: "Guests Can See Other Guests",
      description: "Allow attendees to see the full guest list.",
      type: "boolean",
      required: false,
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
      description: "Google Calendar color id (1–11). Optional.",
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
    { name: "eventId", type: "string", description: "The updated event id." },
    { name: "htmlLink", type: "string", description: "Calendar UI link to the event (or null).", nullable: true },
    { name: "summary", type: "string", description: "The event title (or null).", nullable: true },
    {
      name: "description",
      type: "string",
      description: "The event description (or null).",
      sensitive: true,
      nullable: true,
    },
    { name: "location", type: "string", description: "The event location (or null).", nullable: true },
    { name: "start", type: "object", description: "Event start (date or dateTime + timeZone; or null).", nullable: true },
    { name: "end", type: "object", description: "Event end (date or dateTime + timeZone; or null).", nullable: true },
    {
      name: "attendees",
      type: "array",
      description: "Attendees on the event (each carries an email address).",
      sensitive: true,
    },
    { name: "status", type: "string", description: "Event status (or null).", nullable: true },
    { name: "updated", type: "string", description: "ISO-8601 last-modified timestamp (or null).", nullable: true },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 30,
  riskLevel: "medium",
  riskDescription: "Edits an existing event and may email updates (recoverable — patch again to revert).",
};
