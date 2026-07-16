import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder metadata for `microsoft-outlook-calendar:list_events` —
 * Slice 4.OUTLOOK-CAL-META-2. Mirrors `listEvents.schema.ts`. Read
 * action (low risk).
 *
 * Smart endpoint switch (runtime-owned): when both `startDateTime` +
 * `endDateTime` are set, the handler hits `/me/calendarView` (auto-
 * expands recurring); else `/me/events` (master events). The both-or-
 * neither cross-field invariant is enforced by the schema's `refine` —
 * the meta documents it via help text.
 *
 * `top` is the Graph $top cap (1–100, default 25 — much tighter than
 * GCal's 2500). No `calendarId` field (actions are pinned to /me).
 *
 * `events` is sensitive (bulk read carries attendee/organizer emails +
 * onlineMeetingUrl) — mirror Notion `results` / Gmail `messages` /
 * GCal `events` precedent.
 */
export const microsoftOutlookCalendarListEventsMeta: ActionMeta = {
  key: "microsoft-outlook-calendar:list_events",
  provider: "microsoft-outlook-calendar",
  type: "list_events",
  displayName: "List Events",
  description:
    "List events on your Outlook Calendar. Set a time range to use Outlook's calendar view (which expands recurring events); leave it empty to get the master event series.",
  category: "calendar",
  requiresIntegration: true,
  fields: [
    {
      name: "startDateTime",
      label: "Start Of Window",
      description:
        "Earliest event start to include (UTC). Set both window fields or neither.",
      type: "datetime-utc",
      required: false,
      placeholder: "2026-06-01T00:00:00Z",
    },
    {
      name: "endDateTime",
      label: "End Of Window",
      description:
        "Latest event start to include (UTC). Set both window fields or neither.",
      type: "datetime-utc",
      required: false,
      placeholder: "2026-06-30T23:59:59Z",
    },
    {
      name: "top",
      label: "Max Results",
      description: "Maximum events to return (1–100). Graph caps page size at 100.",
      type: "number",
      required: false,
      defaultValue: 25,
      numeric: { min: 1, max: 100, integer: true },
    },
    {
      name: "orderBy",
      label: "Order By",
      description: "Sort order.",
      type: "select",
      required: false,
      defaultValue: "start",
      options: [
        { value: "start", label: "Start time" },
        { value: "subject", label: "Subject" },
      ],
    },
    {
      name: "subjectFilter",
      label: "Subject Contains",
      description: "Only include events whose title contains this text.",
      type: "text",
      required: false,
    },
  ],
  outputs: [
    {
      name: "events",
      type: "array",
      description:
        "The matching events (each carries subject, start/end, attendees, organizer, location, onlineMeetingUrl, etc.).",
      sensitive: true,
    },
    { name: "count", type: "number", description: "Number of events in this page." },
    { name: "hasMore", type: "boolean", description: "True when Graph reports more pages." },
    { name: "nextLink", type: "string", description: "Graph paging cursor (or null)." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 20,
  riskLevel: "low",
  riskDescription: "Reads Outlook calendar events — no provider-side mutation.",
};
