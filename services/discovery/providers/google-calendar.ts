import type { ActionMeta } from "@/contracts/actionMeta";
import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Google Calendar discovery sub-registry — Slice 4.GCAL-META-2.
 *
 * Per-provider extraction of the Calendar meta imports so the central
 * `services/discovery/_registry.ts` stays manageable (same pattern as
 * `providers/microsoft-teams.ts` / `providers/microsoft-onedrive.ts`). The
 * central registry spreads `GOOGLE_CALENDAR_ACTION_METAS` /
 * `GOOGLE_CALENDAR_TRIGGER_METAS`; module-load validation + duplicate-key
 * rejection happen centrally — this file is import grouping only.
 *
 * **Coverage:** 5 actions + 1 webhook trigger. Field names are camelCase to
 * mirror the Calendar runtime Zod schemas 1:1 (drift fails the meta-coverage
 * structural test now that `google-calendar` is in `COVERED_PROVIDERS`).
 *
 * **No resolver wiring (v1):** `calendarId` ships as typeable text defaulting
 * to "primary" — the `google-calendar:calendars` picker is scope-blocked (the
 * manifest grants `calendar.events` only, no `calendarList` scope; a picker
 * would force every connected user to reconnect). `eventId` ships as typeable
 * text (trigger/upstream-fed). `google-calendar:events` / `:timezones` /
 * `:colors` resolvers are deferred/rejected — none is referenced by any field.
 * `calendarId`/`eventId` are already real schema fields, so **NO UI-scope
 * additions** were needed (GCAL-META-2 is pure additive metadata).
 *
 * **Risk:** `create_event` / `update_event` / `add_attendees` medium;
 * `list_events` low; **`delete_event` high + isDestructive +
 * requiresConfirmation** (irreversible delete + attendee cancellation emails
 * — Marcus decision; mirrors Airtable/Excel/OneDrive deletes).
 *
 * **Sensitive:** attendee email arrays (`attendees`, `addedAttendees`,
 * `alreadyInvited`), the `events` bulk read, the Google Meet `meetLink`, and
 * event `description` bodies (actions + trigger). Ids / titles / `location` /
 * `htmlLink` / dates / counts / pagination cursors are structural.
 *
 * The `event_changed` trigger registers its activation in
 * `triggers/eventChanged/index.ts` (loaded by `integrations/_registry.ts`),
 * so the trigger-meta-activation-invariant passes without an exemption.
 */

import { googleCalendarCreateEventMeta } from "@/integrations/google-calendar/actions/createEvent.meta";
import { googleCalendarListEventsMeta } from "@/integrations/google-calendar/actions/listEvents.meta";
import { googleCalendarUpdateEventMeta } from "@/integrations/google-calendar/actions/updateEvent.meta";
import { googleCalendarDeleteEventMeta } from "@/integrations/google-calendar/actions/deleteEvent.meta";
import { googleCalendarAddAttendeesMeta } from "@/integrations/google-calendar/actions/addAttendees.meta";

import { googleCalendarEventChangedTriggerMeta } from "@/integrations/google-calendar/triggers/eventChanged/eventChanged.meta";

/** Calendar action metas in displayOrder (10..50). */
export const GOOGLE_CALENDAR_ACTION_METAS: ReadonlyArray<ActionMeta> = [
  googleCalendarCreateEventMeta,
  googleCalendarListEventsMeta,
  googleCalendarUpdateEventMeta,
  googleCalendarDeleteEventMeta,
  googleCalendarAddAttendeesMeta,
];

/** Calendar trigger metas — 1 watch-based webhook trigger. */
export const GOOGLE_CALENDAR_TRIGGER_METAS: ReadonlyArray<TriggerMeta> = [
  googleCalendarEventChangedTriggerMeta,
];
