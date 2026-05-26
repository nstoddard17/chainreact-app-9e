import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder metadata for `microsoft-outlook-calendar:event_changed` —
 * Slice 4.OUTLOOK-CAL-META-2.
 *
 * Microsoft Graph subscription trigger on `/me/events` with
 * `changeType:"created,updated,deleted"`. ~70.5h (4230 min) renewal via
 * the shared `subscriptionRegistry` cron. Dedup key shape (from
 * `normalize.ts`): `${subscriptionId}:${eventId}:${changeType}` —
 * created → updated → deleted on the same event emits three distinct
 * dispatcher events. When Graph 404s on the post-notification GET (the
 * event was already deleted), `normalizeDeleted` emits a stable
 * minimal payload with `subject:null` so workflow authors don't need
 * to special-case the missing-body path.
 *
 * Activation is registered in `triggers/eventChanged/index.ts` via
 * `registerActivation("microsoft-outlook-calendar","event_changed",…)`
 * (loaded by `integrations/_registry.ts`), so the trigger-meta-
 * activation-invariant passes with no exemption.
 *
 * **`fields:[]` — empty, no per-trigger config (runtime decision).**
 * Every workflow's Outlook Calendar trigger watches the same /me/events
 * resource with the same changeType set; there are no per-workflow
 * filtering knobs. Mirrors the OneDrive `file_changed` `fields:[]`
 * precedent.
 *
 * Sensitive payload fields:
 *   - `body` — FORCED sensitive (name in SUSPICIOUS_NAMES set + event-
 *     body content per Marcus sign-off).
 *   - `attendees` — plan-marked (email PII array; kept as flat array
 *     without nested `fields[]`).
 *   - `organizer` — plan-marked (organizer email PII object; kept flat).
 *   - `onlineMeetingUrl` — plan-marked (Teams join URL = access-bearing
 *     capability URL; mirror GCal `meetLink` Marcus decision).
 * Not marked: eventId / changeType / subject (title-like, mirror Teams
 * subject / GCal summary) / start / end / isAllDay / location (string
 * displayName) / webLink (auth-gated deeplink, mirror OneDrive webUrl)
 * / isOnlineMeeting (boolean) / importance / sensitivity (enum) /
 * createdDateTime / lastModifiedDateTime.
 */
export const microsoftOutlookCalendarEventChangedTriggerMeta: TriggerMeta = {
  key: "microsoft-outlook-calendar:event_changed",
  provider: "microsoft-outlook-calendar",
  type: "event_changed",
  displayName: "Event Changed",
  description:
    "Fires when an event is created, updated, or deleted on your Outlook Calendar.",
  category: "calendar",
  activation: "webhook",
  requiresIntegration: true,
  fields: [],
  payloadShape: [
    { name: "eventId", type: "string", description: "The changed event id." },
    {
      name: "changeType",
      type: "string",
      description: "What changed: created | updated | deleted.",
    },
    { name: "subject", type: "string", description: "The event title (or null on deleted)." },
    { name: "start", type: "object", description: "Event start (dateTime + timeZone) or null." },
    { name: "end", type: "object", description: "Event end (dateTime + timeZone) or null." },
    { name: "isAllDay", type: "boolean", description: "Whether the event is all-day." },
    {
      name: "location",
      type: "string",
      description: "Event location displayName (or null).",
    },
    {
      name: "body",
      type: "object",
      description: "Event body ({contentType, content}) or null.",
      sensitive: true,
    },
    {
      name: "attendees",
      type: "array",
      description: "Attendees on the event (each carries an email address).",
      sensitive: true,
    },
    {
      name: "organizer",
      type: "object",
      description: "The event organizer (name + email address) or null.",
      sensitive: true,
    },
    {
      name: "isOnlineMeeting",
      type: "boolean",
      description: "Whether the event has an attached Teams meeting.",
    },
    {
      name: "onlineMeetingUrl",
      type: "string",
      description: "Teams meeting join URL (or null).",
      sensitive: true,
    },
    { name: "webLink", type: "string", description: "Outlook UI link to the event (or null)." },
    {
      name: "importance",
      type: "string",
      description: "Event importance: low | normal | high.",
    },
    {
      name: "sensitivity",
      type: "string",
      description: "Event sensitivity: normal | personal | private | confidential.",
    },
    { name: "createdDateTime", type: "string", description: "ISO-8601 created (or null)." },
    {
      name: "lastModifiedDateTime",
      type: "string",
      description: "ISO-8601 last-modified (or null).",
    },
  ],
  displayOrder: 10,
};
