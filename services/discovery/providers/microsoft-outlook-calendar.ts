import type { ActionMeta } from "@/contracts/actionMeta";
import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Microsoft Outlook Calendar discovery sub-registry — Slice
 * 4.OUTLOOK-CAL-META-2 (the final launch-gap provider).
 *
 * Per-provider extraction of the Outlook Calendar meta imports so the
 * central `services/discovery/_registry.ts` stays manageable (same
 * pattern as `providers/google-drive.ts` / `providers/google-calendar.ts`
 * / `providers/microsoft-teams.ts`). The central registry spreads
 * `MICROSOFT_OUTLOOK_CALENDAR_ACTION_METAS` /
 * `MICROSOFT_OUTLOOK_CALENDAR_TRIGGER_METAS`; module-load validation +
 * duplicate-key rejection happen centrally — this file is import
 * grouping only.
 *
 * **Coverage:** 5 actions + 1 webhook trigger. After this slice ships,
 * Outlook Calendar is builder-visible — the launch-gap tracker hits
 * 26/26 (deferred items remain outside that count; see the plan's §10
 * post-26/26 closeout reminder).
 *
 * **ZERO resolver wiring:** every id-bearing field that needs a picker
 * has no consumer (no `calendarId` field anywhere on any schema; no
 * `categoryId` field; etc.) — `microsoft-outlook-calendar:calendars` /
 * `:events` / `:timezones` / `:categories` are all rejected-or-deferred,
 * none referenced. `eventId` on update/delete/add_attendees is typeable
 * text (commonly trigger/upstream-fed).
 *
 * **Approach-A flat-time-fields shim:** the meta exposes
 * `startDateTime` / `startTimeZone` / `endDateTime` / `endTimeZone` as
 * flat text fields on create_event + update_event. The handler schemas
 * accept BOTH the canonical nested shape AND the flat shape via a
 * narrow Zod preprocess (additive, behavior-preserving — existing
 * direct-handler tests using the nested shape still pass unchanged).
 *
 * **Risk:** create_event / update_event / add_attendees medium;
 * list_events low; **delete_event high + isDestructive +
 * requiresConfirmation** (Microsoft Graph notifies attendees of
 * cancellation per tenant mail-flow policy — no caller-side suppress
 * knob; mirrors GCal / OneDrive / Airtable destructive trio).
 *
 * **Sensitive (deliberate plan-marks, with `body` forced by the
 * suspicious-name set):**
 *   - `attendees` arrays + `organizer` objects on action outputs + the
 *     trigger payload (email PII).
 *   - `events` bulk read on list_events (carries attendee + organizer
 *     emails + onlineMeetingUrl).
 *   - `attendeesAdded` + `attendeesAlreadyPresent` on add_attendees.
 *   - Trigger payload `body` (FORCED by SUSPICIOUS_NAMES) +
 *     `onlineMeetingUrl` (access-bearing Teams join URL; mirror GCal
 *     `meetLink` Marcus decision).
 *
 * The `event_changed` trigger registers its activation in
 * `triggers/eventChanged/index.ts` (loaded by `integrations/_registry.ts`),
 * so the trigger-meta-activation-invariant passes without an exemption.
 * The trigger has `fields:[]` — runtime emits one event per
 * notification with no per-workflow filtering (mirrors OneDrive
 * `file_changed`).
 */

import { microsoftOutlookCalendarCreateEventMeta } from "@/integrations/microsoft-outlook-calendar/actions/createEvent.meta";
import { microsoftOutlookCalendarListEventsMeta } from "@/integrations/microsoft-outlook-calendar/actions/listEvents.meta";
import { microsoftOutlookCalendarUpdateEventMeta } from "@/integrations/microsoft-outlook-calendar/actions/updateEvent.meta";
import { microsoftOutlookCalendarDeleteEventMeta } from "@/integrations/microsoft-outlook-calendar/actions/deleteEvent.meta";
import { microsoftOutlookCalendarAddAttendeesMeta } from "@/integrations/microsoft-outlook-calendar/actions/addAttendees.meta";

import { microsoftOutlookCalendarEventChangedTriggerMeta } from "@/integrations/microsoft-outlook-calendar/triggers/eventChanged/eventChanged.meta";

/** Outlook Calendar action metas in displayOrder (10..50). */
export const MICROSOFT_OUTLOOK_CALENDAR_ACTION_METAS: ReadonlyArray<ActionMeta> = [
  microsoftOutlookCalendarCreateEventMeta,
  microsoftOutlookCalendarListEventsMeta,
  microsoftOutlookCalendarUpdateEventMeta,
  microsoftOutlookCalendarDeleteEventMeta,
  microsoftOutlookCalendarAddAttendeesMeta,
];

/** Outlook Calendar trigger metas — 1 Graph subscription webhook trigger. */
export const MICROSOFT_OUTLOOK_CALENDAR_TRIGGER_METAS: ReadonlyArray<TriggerMeta> = [
  microsoftOutlookCalendarEventChangedTriggerMeta,
];
