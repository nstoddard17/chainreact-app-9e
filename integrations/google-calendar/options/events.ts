import {
  InsufficientScopeError,
  IntegrationActionRequiredError,
  refreshAndRetry,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionsResolver,
} from "@/services/options/types";
import { eventsList } from "@/integrations/google-calendar/api/eventsList";
import { NotFoundError } from "@/integrations/google-calendar/api/errors";

/**
 * `google-calendar:events` options resolver — Slice RESOLVERS-2.
 *
 * Backs the `eventId` field on `update_event` / `delete_event` /
 * `add_attendees`, which previously forced an ordinary user to hand-type an
 * opaque Google event id.
 *
 * Cascade child of the sibling `calendarId` field (dep name pinned VERBATIM to
 * the runtime Zod schemas). Architecture mirrors
 * `microsoft-powerbi:semantic_models`:
 *   - `requiresIntegration: true` — the route loads the active Google Calendar
 *     integration row and short-circuits with INTEGRATION_DISCONNECTED.
 *   - `requiredDeps: ["calendarId"]` — the route short-circuits with
 *     MISSING_DEPENDENCY before dispatch when the calendar is blank. In
 *     practice `calendarId` carries `defaultValue: "primary"`, which
 *     `graphSlice` seeds into the node config on add, so the picker loads
 *     immediately without the author touching the calendar field.
 *   - A deleted / inaccessible parent calendar (`NotFoundError`, Google's 404)
 *     resolves to an EMPTY picker rather than an error.
 *   - Wrapper goes through `refreshAndRetry` (Google is oauth_with_refresh).
 *
 * LISTING WINDOW (see also the Outlook sibling, which uses the same window):
 *   `timeMin` = 30 days ago, no `timeMax`, `orderBy: "startTime"`,
 *   `singleEvents: true`, `showDeleted: false`, single page of 100.
 *   - 30 days back: the repetitive-task cases these three actions serve
 *     (reschedule / cancel / add a guest) act on events that are upcoming or
 *     very recently past. A pure `now`-forward window would hide "this
 *     morning's standup", which is a common target.
 *   - No `timeMax`: `orderBy: startTime` returns soonest-first, so the single
 *     page is naturally the near-term events; a far-future bound would only
 *     drop items the author might legitimately want.
 *   - `singleEvents: true` expands recurring series into instances, so the
 *     picked id is the INSTANCE id the handler will patch/delete — matching
 *     what the user sees in their calendar. Google REQUIRES `singleEvents:
 *     true` for `orderBy: startTime`.
 *
 * SEARCH: `ctx.q` is passed to Google's own `q` parameter (server-side
 * full-text over the event) rather than filtered client-side, so searching
 * reaches beyond the first page. `hasMore` reports `nextPageToken` honestly.
 *
 * SCOPE / RECONNECT: `events.list` reads on `calendar.readonly` / the events
 * scope. A token predating the manifest's `calendar.readonly` addition gets
 * HTTP 403 → `InsufficientScopeError` → `PROVIDER_REAUTH_REQUIRED`. Manual id
 * entry (`allowManualEntry`) + `{{...}}` upstream mapping keep the field usable
 * meanwhile.
 */

const PAGE_SIZE = 100;
const WINDOW_DAYS_BACK = 30;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/**
 * Formats a Google event start into a stable, readable label suffix WITHOUT
 * timezone conversion — the wall-clock components are read straight out of the
 * RFC-3339 string, so the label shows the event's own local time exactly as it
 * appears in the user's calendar (Google's `dateTime` carries the event's
 * offset). Using `new Date(...)` here would silently re-render the time in the
 * SERVER's zone, which is wrong for the label.
 *
 * Returns null when the shape isn't recognizable, so the caller can fall back.
 */
function formatEventStart(start: unknown): string | null {
  if (!start || typeof start !== "object") return null;
  const s = start as { date?: unknown; dateTime?: unknown };

  // All-day event: `date` is a bare "YYYY-MM-DD".
  if (typeof s.date === "string") {
    const day = formatDatePart(s.date);
    return day ? `${day} (all day)` : null;
  }

  if (typeof s.dateTime !== "string") return null;
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(s.dateTime);
  if (!m) return null;
  const day = formatDatePart(m[1]!);
  if (!day) return null;
  return `${day}, ${m[2]}:${m[3]}`;
}

/** "2026-07-20" → "Mon 20 Jul 2026". Pure; no timezone shift (UTC math only). */
function formatDatePart(isoDate: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${weekday} ${day} ${MONTHS[month - 1]} ${year}`;
}

export const googleCalendarEventsResolver: OptionsResolver = {
  source: "google-calendar:events",
  provider: "google-calendar",
  requiresIntegration: true,
  requiredDeps: ["calendarId"],
  async resolve(ctx) {
    if (!ctx.integration) {
      throw new OptionsResolverError(
        "INTEGRATION_DISCONNECTED",
        "No active Google Calendar integration. Connect Google Calendar first.",
      );
    }
    const integration = ctx.integration;

    const calendarId = ctx.deps.calendarId;
    if (typeof calendarId !== "string" || calendarId.length === 0) {
      throw new OptionsResolverError(
        "MISSING_DEPENDENCY",
        "Select a calendar first.",
      );
    }

    const timeMin = new Date(
      Date.now() - WINDOW_DAYS_BACK * 24 * 60 * 60 * 1000,
    ).toISOString();

    let page;
    try {
      page = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "google-calendar",
        providerAccountId: null,
        apiCall: (accessToken) =>
          eventsList({
            accessToken,
            calendarId,
            timeMin,
            maxResults: PAGE_SIZE,
            // Server-side search — reaches past the first page.
            q: ctx.q.length > 0 ? ctx.q : undefined,
            orderBy: "startTime",
            // Required by Google whenever orderBy=startTime; also gives the
            // author the instance id they actually mean for a recurring event.
            singleEvents: true,
            showDeleted: false,
          }),
      });
    } catch (err) {
      if (err instanceof InsufficientScopeError) {
        throw new OptionsResolverError(
          "PROVIDER_REAUTH_REQUIRED",
          "Reconnect Google Calendar to allow listing your events.",
        );
      }
      if (
        err instanceof IntegrationActionRequiredError ||
        err instanceof Unauthorized401Error
      ) {
        throw new OptionsResolverError(
          "INTEGRATION_DISCONNECTED",
          "Reconnect Google Calendar and try again.",
        );
      }
      if (err instanceof NotFoundError) {
        // Parent calendar no longer exists / not accessible — empty picker,
        // not an error (mirrors microsoft-powerbi:semantic_models).
        return { items: [], hasMore: false };
      }
      throw new OptionsResolverError(
        "PROVIDER_ERROR",
        "Couldn't load Google Calendar events. Try again.",
      );
    }

    const items: Array<{ value: string; label: string; description?: string }> =
      [];
    for (const event of page.items ?? []) {
      if (typeof event.id !== "string" || event.id.length === 0) continue;
      if (event.status === "cancelled") continue;

      const title =
        typeof event.summary === "string" && event.summary.trim().length > 0
          ? event.summary.trim()
          : "(no title)";
      const when = formatEventStart(event.start);
      // Titles repeat ("Weekly Standup"), so the start disambiguates. Never
      // fall back to the raw id as the label.
      const label = when ? `${title} - ${when}` : title;

      const timeZone =
        event.start &&
        typeof event.start === "object" &&
        typeof (event.start as { timeZone?: unknown }).timeZone === "string"
          ? ((event.start as { timeZone?: string }).timeZone as string)
          : undefined;

      items.push(timeZone ? { value: event.id, label, description: timeZone } : { value: event.id, label });
    }

    return {
      items,
      hasMore:
        typeof page.nextPageToken === "string" && page.nextPageToken.length > 0,
    };
  },
};
