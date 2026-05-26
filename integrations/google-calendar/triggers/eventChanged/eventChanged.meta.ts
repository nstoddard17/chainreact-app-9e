import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder metadata for `google-calendar:event_changed` — Slice 4.GCAL-META-2.
 *
 * Watch-based Google Calendar push trigger (`events.watch` channel →
 * `/api/webhooks/google-calendar`, syncToken delta pull, ~7-day renewal).
 * Activation is registered in `triggers/eventChanged/index.ts` via
 * `registerActivation("google-calendar","event_changed",…)` (loaded by
 * `integrations/_registry.ts`), so the trigger-meta-activation-invariant
 * passes with no exemption.
 *
 * Single config field: `calendarId` (typeable text, default "primary" — the
 * watch anchor; the runtime `activate` reads only this and falls back to
 * "primary"). No resolver wiring (the `calendars` picker is scope-blocked —
 * see the GCAL-META plan §3).
 *
 * Payload mirrors `normalize.ts`. Sensitive: `attendees` (attendee email
 * PII) + `description` (event body). Ids / titles / `location` / dates /
 * `htmlLink` / `status` / `changeKind` are structural.
 */
export const googleCalendarEventChangedTriggerMeta: TriggerMeta = {
  key: "google-calendar:event_changed",
  provider: "google-calendar",
  type: "event_changed",
  displayName: "Event Changed",
  description:
    "Fires when an event is created, updated, or cancelled on the selected Google Calendar.",
  category: "calendar",
  activation: "webhook",
  requiresIntegration: true,
  fields: [
    {
      name: "calendarId",
      label: "Calendar",
      description:
        'Calendar to watch. Defaults to "primary". You can paste another calendar id (e.g. you@gmail.com).',
      type: "text",
      required: false,
      defaultValue: "primary",
      placeholder: "primary",
    },
  ],
  payloadShape: [
    {
      name: "changeKind",
      type: "string",
      description: "What changed: created | updated | cancelled.",
    },
    { name: "calendarId", type: "string", description: "The watched calendar id." },
    { name: "eventId", type: "string", description: "The changed event id." },
    { name: "summary", type: "string", description: "The event title (or null)." },
    {
      name: "description",
      type: "string",
      description: "The event description (or null).",
      sensitive: true,
    },
    { name: "location", type: "string", description: "The event location (or null)." },
    { name: "start", type: "object", description: "Event start (date or dateTime + timeZone)." },
    { name: "end", type: "object", description: "Event end (date or dateTime + timeZone)." },
    {
      name: "attendees",
      type: "array",
      description: "Attendees on the event (each carries an email address).",
      sensitive: true,
    },
    { name: "htmlLink", type: "string", description: "Calendar UI link to the event (or null)." },
    { name: "status", type: "string", description: "Event status (confirmed / cancelled / …)." },
    { name: "updated", type: "string", description: "ISO-8601 last-modified timestamp." },
  ],
  displayOrder: 10,
};
