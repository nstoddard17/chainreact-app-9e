import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder metadata for `google-calendar:list_events` — Slice 4.GCAL-META-2.
 * Mirrors `listEvents.schema.ts`. Read action (low risk).
 *
 * No resolver wiring: `calendarId` ships as typeable text defaulting to
 * "primary". The `events` output is a bulk array of full event resources
 * carrying per-event content + attendee email PII → sensitive (mirrors the
 * Notion `results` / Gmail `messages` bulk-read precedent).
 */
export const googleCalendarListEventsMeta: ActionMeta = {
  key: "google-calendar:list_events",
  provider: "google-calendar",
  type: "list_events",
  displayName: "List Events",
  description:
    "List events on a Google Calendar, optionally filtered by a time window and a search query.",
  category: "calendar",
  requiresIntegration: true,
  fields: [
    {
      name: "calendarId",
      label: "Calendar",
      description:
        'Calendar to read. Pick from your calendars, or paste a calendar id (e.g. you@gmail.com). Defaults to "primary".',
      type: "combobox",
      optionsSource: "google-calendar:calendars",
      allowManualEntry: true,
      required: false,
      defaultValue: "primary",
      placeholder: "Search calendars or paste an ID",
    },
    {
      name: "timeMin",
      label: "Start Of Window",
      description: "Lower bound, entered in **UTC** (stored as `2026-06-01T00:00:00Z`) — only events ending after this are returned.",
      type: "datetime-utc",
      required: false,
      placeholder: "2026-06-01T00:00:00Z",
    },
    {
      name: "timeMax",
      label: "End Of Window",
      description: "Upper bound, entered in **UTC** (stored as `2026-06-30T23:59:59Z`) — only events starting before this are returned.",
      type: "datetime-utc",
      required: false,
      placeholder: "2026-06-30T23:59:59Z",
    },
    {
      name: "maxResults",
      label: "Max Results",
      description: "Maximum events to return per page (1–2500).",
      type: "number",
      required: false,
      defaultValue: 250,
      numeric: { min: 1, max: 2500, integer: true },
    },
    {
      name: "query",
      label: "Search",
      description: "Free-text query against title, description, location, and attendees.",
      type: "text",
      required: false,
    },
    {
      name: "orderBy",
      label: "Order By",
      description: 'Sort order. "startTime" requires Expand Recurring to be on.',
      type: "select",
      required: false,
      options: [
        { value: "startTime", label: "Start time" },
        { value: "updated", label: "Last updated" },
      ],
    },
    {
      name: "singleEvents",
      label: "Expand Recurring",
      description: "Expand recurring events into individual instances.",
      type: "boolean",
      required: false,
      defaultValue: true,
    },
    {
      name: "showDeleted",
      label: "Include Cancelled",
      description: "Include cancelled (deleted) events in the results.",
      type: "boolean",
      required: false,
      defaultValue: false,
    },
    {
      name: "pageToken",
      label: "Page Token",
      description: "Pagination cursor from a prior run's Next Page Token.",
      type: "text",
      required: false,
      advanced: true,
    },
  ],
  outputs: [
    {
      name: "events",
      type: "array",
      description: "The matching events (each carries title, description, location, and attendees).",
      sensitive: true,
    },
    { name: "count", type: "number", description: "Number of events in this page." },
    { name: "firstEventId", type: "string", description: "Id of the first event (or null)." },
    { name: "lastEventId", type: "string", description: "Id of the last event (or null)." },
    { name: "nextPageToken", type: "string", description: "Cursor for the next page (or null)." },
    { name: "nextSyncToken", type: "string", description: "Incremental-sync cursor (or null)." },
    { name: "calendarId", type: "string", description: "The calendar that was read." },
    { name: "timeMin", type: "string", description: "Echo of the start-of-window filter (or null)." },
    { name: "timeMax", type: "string", description: "Echo of the end-of-window filter (or null)." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 20,
  riskLevel: "low",
  riskDescription: "Reads calendar events — no provider-side mutation.",
};
