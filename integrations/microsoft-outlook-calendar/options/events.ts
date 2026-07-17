import {
  IntegrationActionRequiredError,
  refreshAndRetry,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionsResolver,
} from "@/services/options/types";
import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";
import { eventsList } from "@/integrations/microsoft-outlook-calendar/api/eventsList";

/**
 * `microsoft-outlook-calendar:events` options resolver — Slice RESOLVERS-2.
 *
 * Backs the `eventId` field on `update_event` / `delete_event` /
 * `add_attendees`, which previously forced an ordinary user to hand-type an
 * opaque Graph event id.
 *
 * ── NO PARENT DEP (deliberate, verified against the runtime schemas) ──
 * Unlike the Google sibling, this resolver declares NO `requiredDeps`. The
 * three Outlook Calendar actions have NO `calendarId` field: their schemas
 * (`updateEvent.schema.ts` / `deleteEvent.schema.ts` / `addAttendees.schema.ts`)
 * accept `eventId` only, and their wrappers address `/me/events/{id}` — i.e.
 * the signed-in user's DEFAULT calendar. There is therefore no sibling calendar
 * field to depend on, and inventing one would mean changing the runtime schema
 * (out of scope + explicitly forbidden). Listing from the same default-calendar
 * scope the handlers write to keeps the picker honest: every id offered here is
 * an id those handlers can actually address. If a `calendarId` field is ever
 * added to those actions, this resolver should gain `requiredDeps:
 * ["calendarId"]` and the wrapper should switch to
 * `/me/calendars/{id}/calendarView`.
 *
 * Behavior mirrors the sibling `microsoft-outlook-calendar:calendars` resolver:
 *   - `requiresIntegration: true` — the route loads the caller's active Outlook
 *     Calendar integration and short-circuits with INTEGRATION_DISCONNECTED.
 *   - Refreshable → `refreshAndRetry`. Reads on the already-granted
 *     `Calendars.ReadWrite` scope — no reconnect required.
 *   - `NotFoundError` → EMPTY picker, not an error (mirrors
 *     `microsoft-powerbi:semantic_models`' parent-gone fallback).
 *
 * LISTING WINDOW (same window as the Google sibling, for consistency):
 *   `/me/calendarView` from 30 days ago to 180 days ahead, `$orderby
 *   start/dateTime`, single page of 100.
 *   - `calendarView` (not `/me/events`) because it AUTO-EXPANDS recurring
 *     series into occurrences and is the only events endpoint that exposes
 *     `start/dateTime` as an orderable field. `/me/events` returns one row per
 *     SERIES and can only be ordered by `createdDateTime` — an author picking
 *     "Weekly Standup" there would get the series master, not the occurrence.
 *   - `calendarView` REQUIRES both bounds, hence the explicit 180-day forward
 *     bound (Google needs no `timeMax`).
 *   - 30 days back: reschedule / cancel / add-a-guest commonly target an event
 *     that is upcoming or very recently past.
 *
 * SEARCH — client-side, and this is a DELIBERATE deviation from the usual
 * "push `ctx.q` to the provider" rule, forced by two documented Graph limits:
 *   1. Graph requires that properties in `$orderby` appear FIRST in `$filter`.
 *      `contains(subject, …)` + `$orderby=start/dateTime` therefore fails with
 *      "The restriction or sort order is too complex for this operation."
 *   2. `$search` cannot be combined with `$filter` or `$orderby` at all, and a
 *      `startswith/contains` subject filter on `calendarView` is a known Graph
 *      bug that 500s when ANY event in the window has no subject.
 *   Chronological order is worth more than server-side search for a 100-item
 *   near-term window, so `q` filters the fetched page. `hasMore` still reports
 *   Graph's `@odata.nextLink` honestly (i.e. it describes the WINDOW, not the
 *   filtered result) — the picker's "refine your search" hint stays truthful.
 *
 * PRIVACY: only event id, subject, and start are read into options — never an
 * attendee, organizer, body, or location.
 */

const PAGE_SIZE = 100;
const WINDOW_DAYS_BACK = 30;
const WINDOW_DAYS_FORWARD = 180;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/**
 * Formats a Graph event start into a stable, readable label suffix WITHOUT
 * timezone conversion — the wall-clock components are read straight out of the
 * `start.dateTime` string. Using `new Date(...)` would silently re-render the
 * time in the SERVER's zone. Graph returns `start.dateTime` in UTC by default
 * (absent a `Prefer: outlook.timezone` header), so the zone is surfaced in the
 * option DESCRIPTION rather than being implied by the label.
 *
 * Returns null when the shape isn't recognizable, so the caller can fall back.
 */
function formatEventStart(start: unknown): string | null {
  if (!start || typeof start !== "object") return null;
  const s = start as { dateTime?: unknown };
  if (typeof s.dateTime !== "string") return null;

  // Graph emits "2026-07-20T09:00:00.0000000" (no offset).
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(s.dateTime);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${weekday} ${day} ${MONTHS[month - 1]} ${year}, ${m[4]}:${m[5]}`;
}

export const outlookCalendarEventsResolver: OptionsResolver = {
  source: "microsoft-outlook-calendar:events",
  provider: "microsoft-outlook-calendar",
  requiresIntegration: true,
  async resolve(ctx) {
    if (!ctx.integration) {
      throw new OptionsResolverError(
        "INTEGRATION_DISCONNECTED",
        "Connect Outlook Calendar to pick an event.",
      );
    }
    const integration = ctx.integration;

    const now = Date.now();
    const startDateTime = new Date(
      now - WINDOW_DAYS_BACK * 24 * 60 * 60 * 1000,
    ).toISOString();
    const endDateTime = new Date(
      now + WINDOW_DAYS_FORWARD * 24 * 60 * 60 * 1000,
    ).toISOString();

    let result;
    try {
      result = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "microsoft-outlook-calendar",
        providerAccountId: null,
        apiCall: (accessToken) =>
          eventsList({
            accessToken,
            // Both bounds supplied ⇒ the wrapper hits /me/calendarView, which
            // expands recurrences and orders by start/dateTime.
            startDateTime,
            endDateTime,
            top: PAGE_SIZE,
            orderBy: "start",
            // subjectFilter deliberately omitted — see SEARCH note above.
          }),
      });
    } catch (err) {
      if (
        err instanceof IntegrationActionRequiredError ||
        err instanceof Unauthorized401Error
      ) {
        throw new OptionsResolverError(
          "INTEGRATION_DISCONNECTED",
          "Reconnect Outlook Calendar and try again.",
        );
      }
      if (err instanceof NotFoundError) {
        // Calendar gone / not accessible — empty picker, not an error.
        return { items: [], hasMore: false };
      }
      console.warn(
        JSON.stringify({
          event: "options.outlook_calendar_events.provider_error",
          source: "microsoft-outlook-calendar:events",
        }),
      );
      throw new OptionsResolverError(
        "PROVIDER_ERROR",
        "Couldn't load your Outlook Calendar events. Try again.",
      );
    }

    const lowerQ = ctx.q.toLowerCase();
    const items: Array<{ value: string; label: string; description?: string }> =
      [];
    for (const event of result.events) {
      if (typeof event.id !== "string" || event.id.length === 0) continue;

      const title =
        typeof event.subject === "string" && event.subject.trim().length > 0
          ? event.subject.trim()
          : "(no title)";
      const when = formatEventStart(event.start);
      // Subjects repeat ("Weekly Standup"), so the start disambiguates. Never
      // fall back to the raw id as the label.
      const label = when ? `${title} - ${when}` : title;
      if (lowerQ.length > 0 && !label.toLowerCase().includes(lowerQ)) continue;

      const timeZone =
        event.start && typeof event.start.timeZone === "string"
          ? event.start.timeZone
          : undefined;

      items.push(
        timeZone
          ? { value: event.id, label, description: timeZone }
          : { value: event.id, label },
      );
    }

    return { items, hasMore: result.nextLink !== null };
  },
};
