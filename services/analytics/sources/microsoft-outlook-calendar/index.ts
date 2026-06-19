import { getActiveForExecution } from "@/repositories/integrations";
import {
  IntegrationActionRequiredError,
  Unauthorized401Error,
  refreshAndRetry,
} from "@/services/oauth/refreshAndRetry";
import {
  AnalyticsSourceError,
  type AnalyticsSourceAdapter,
  type AnalyticsSourceContext,
  type AnalyticsSourceMetric,
  type AnalyticsSourceQuery,
  type NormalizedAnalyticsResult,
} from "../types";
import { fetchCalendarEvents, MAX_EVENTS, type FetchedEvents } from "./api";
import {
  DOW_LABELS,
  bucketIndexForMs,
  dateStrToUtcMs,
  dayOfWeekMondayIndex,
  eventDurationHours,
  eventStartDateStr,
  isTimedMeeting,
  parseCalendarId,
  planBuckets,
  type OutlookCalTimeBucket,
} from "./buckets";

/**
 * Microsoft Outlook Calendar connected-app analytics source — v1
 * (Slice ANALYTICS-SOURCES-OUTLOOK-CAL-1). The close mirror of the Google Calendar
 * source, on Microsoft Graph `calendarView`.
 *
 * READ-ONLY. Reduces a BOUNDED window of one calendar's events to numeric
 * aggregates (counts + hours). Never executes a workflow node, never takes a raw
 * Graph query from widget config, never reads event subject / attendees / body /
 * location / links / organizer. Approved metrics only (validated upstream).
 *
 * CREDENTIAL MODEL (personal provider, per core/integrations/credentialSharing.ts):
 * Outlook Calendar is PERSONAL, so this resolves the REQUESTING USER'S OWN
 * connection (`connected_by_user_id = ctx.userId`) and pins the refresh/retry to
 * that row's `providerAccountId` — never a co-member's. The cache layer keys
 * personal providers with `source_user_id = ctx.userId`, so each member's snapshot
 * is distinct. No connection → typed MISSING_CREDENTIAL. Refreshable → the read
 * runs through `refreshAndRetry`.
 *
 * PRIVACY: only event start/end times + all-day/cancelled flags are read (see
 * api.ts) — never subject, attendees, body, location, or links. Only derived
 * counts/hours are returned and cached.
 *
 * SCOPES: uses only the already-granted `Calendars.ReadWrite` scope (calendarView
 * + calendars list). No new scope is requested. The calendar PICKER is OPTIONAL —
 * blank uses the viewer's primary calendar (`/me/calendarView`).
 */

const PROVIDER_KEY = "microsoft-outlook-calendar";

const CALENDAR_FILTER = ["outlook_calendar"] as const;

const METRICS: readonly AnalyticsSourceMetric[] = [
  {
    key: "upcoming_meetings_count",
    label: "Upcoming meetings",
    description: "Meetings scheduled in the period ahead (same length as the selected range).",
    visualizations: ["scalar"],
    supportedGroupBy: [],
    supportedFilters: CALENDAR_FILTER,
  },
  {
    key: "meetings_over_time",
    label: "Meetings over time",
    description: "Meetings per time bucket.",
    visualizations: ["series"],
    supportedGroupBy: [],
    supportedFilters: CALENDAR_FILTER,
  },
  {
    key: "meeting_hours_over_time",
    label: "Meeting hours over time",
    description: "Total meeting hours per time bucket.",
    visualizations: ["series"],
    supportedGroupBy: [],
    supportedFilters: CALENDAR_FILTER,
  },
  {
    key: "busy_hours_by_day",
    label: "Busy hours by weekday",
    description: "Total meeting hours grouped by day of week.",
    visualizations: ["series"],
    supportedGroupBy: [],
    supportedFilters: CALENDAR_FILTER,
  },
];

function liveFreshness(): NormalizedAnalyticsResult["freshness"] {
  return { cached: false, ageSeconds: 0, ttlSeconds: null };
}

/** Map any error from a Graph read into a typed, leak-free AnalyticsSourceError. */
function classifyCalendarError(err: unknown): AnalyticsSourceError {
  if (err instanceof AnalyticsSourceError) return err;
  if (err instanceof IntegrationActionRequiredError || err instanceof Unauthorized401Error) {
    return new AnalyticsSourceError(
      "Reconnect Outlook Calendar before this widget can load.",
      "MISSING_CREDENTIAL",
    );
  }
  const message = err instanceof Error ? err.message : String(err);
  if (/throttl|too many requests|HTTP 429|\b429\b/i.test(message)) {
    return new AnalyticsSourceError("Microsoft's rate limit was reached. Try again shortly.", "RATE_LIMITED");
  }
  if (/ErrorItemNotFound|not found|HTTP 404|\b404\b/i.test(message)) {
    return new AnalyticsSourceError(
      "ChainReact couldn't read that calendar. Check the calendar or your access.",
      "INVALID_QUERY",
    );
  }
  // No raw Graph error body / token / payload leaks — a generic, safe message.
  return new AnalyticsSourceError("Couldn't load Outlook Calendar data.", "PROVIDER_ERROR");
}

/** Resolve the requesting user's OWN Outlook Calendar connection (or MISSING_CREDENTIAL). */
async function resolveOwnCalendar(
  ctx: AnalyticsSourceContext,
): Promise<{ providerAccountId: string | null }> {
  const integration = await getActiveForExecution(ctx.accountId, PROVIDER_KEY, null, {
    connectedByUserId: ctx.userId,
  });
  if (!integration) {
    throw new AnalyticsSourceError("Connect Outlook Calendar to use this widget.", "MISSING_CREDENTIAL");
  }
  return { providerAccountId: integration.providerAccountId };
}

function truncationWarnings(truncated: boolean): string[] {
  return truncated
    ? [`Showing the first ${MAX_EVENTS} events — this calendar had more in this range.`]
    : [];
}

function scalarResult(
  metricKey: string,
  value: number,
  generatedAt: string,
  warnings: string[],
  truncated: boolean,
): NormalizedAnalyticsResult {
  return {
    shape: "scalar",
    dimensions: [],
    measures: [metricKey],
    rows: [{ [metricKey]: value }],
    totals: { [metricKey]: value },
    generatedAt,
    freshness: liveFreshness(),
    warnings,
    truncated,
  };
}

function seriesResult(
  buckets: readonly OutlookCalTimeBucket[],
  values: readonly number[],
  measure: "count" | "hours",
  generatedAt: string,
  warnings: string[],
  truncated: boolean,
  round: boolean,
): NormalizedAnalyticsResult {
  const norm = (n: number) => (round ? Math.round(n * 100) / 100 : n);
  return {
    shape: "series",
    dimensions: ["date"],
    measures: [measure],
    rows: buckets.map((b, i) => ({ date: b.key, [measure]: norm(values[i] ?? 0) })),
    totals: { [measure]: norm(values.reduce((a, b) => a + b, 0)) },
    generatedAt,
    freshness: liveFreshness(),
    warnings,
    truncated,
  };
}

export const microsoftOutlookCalendarAnalyticsSource: AnalyticsSourceAdapter = {
  providerKey: PROVIDER_KEY,
  displayName: "Microsoft Outlook Calendar",
  connectedApp: true,
  cacheTtlSeconds: 600,
  metrics: METRICS,

  async query(
    query: AnalyticsSourceQuery,
    ctx: AnalyticsSourceContext,
  ): Promise<NormalizedAnalyticsResult> {
    const metric = METRICS.find((m) => m.key === query.metricKey);
    if (!metric) {
      throw new AnalyticsSourceError(
        `Unknown Outlook Calendar metric: ${query.metricKey}`,
        "UNKNOWN_METRIC",
      );
    }

    // Validate the calendar filter server-side BEFORE any I/O (blank → primary).
    let calendarId: string | null;
    try {
      calendarId = parseCalendarId(query.filters?.outlook_calendar);
    } catch (err) {
      throw new AnalyticsSourceError(
        err instanceof Error ? err.message : "Invalid calendar.",
        "INVALID_QUERY",
      );
    }

    const generatedAt = new Date().toISOString();
    const sinceMs = Date.parse(query.range.since);
    const untilMs = Date.parse(query.range.until);
    const validRange = !Number.isNaN(sinceMs) && !Number.isNaN(untilMs) && untilMs > sinceMs;

    // "Upcoming" looks FORWARD a window the same length as the selected range.
    const isUpcoming = query.metricKey === "upcoming_meetings_count";
    const durationMs = validRange ? untilMs - sinceMs : 0;
    const windowMin = isUpcoming ? new Date(untilMs).toISOString() : query.range.since;
    const windowMax = isUpcoming ? new Date(untilMs + durationMs).toISOString() : query.range.until;

    const { providerAccountId } = await resolveOwnCalendar(ctx);

    let fetched: FetchedEvents;
    try {
      fetched = await refreshAndRetry({
        accountId: ctx.accountId,
        provider: PROVIDER_KEY,
        providerAccountId,
        apiCall: (accessToken) => fetchCalendarEvents(accessToken, calendarId, windowMin, windowMax),
      });
    } catch (err) {
      throw classifyCalendarError(err);
    }

    const warnings = truncationWarnings(fetched.truncated);
    const meetings = fetched.events.filter(isTimedMeeting);

    // ── Scalar: upcoming meetings ──────────────────────────────────────────────
    if (query.metricKey === "upcoming_meetings_count") {
      return scalarResult("upcoming_meetings_count", meetings.length, generatedAt, warnings, fetched.truncated);
    }

    // ── Breakdown: busy hours by weekday (Mon-first, fixed 7 rows) ─────────────
    if (query.metricKey === "busy_hours_by_day") {
      const hoursByDay = new Array<number>(7).fill(0);
      for (const ev of meetings) {
        const dateStr = eventStartDateStr(ev);
        const hours = eventDurationHours(ev);
        if (dateStr === null || hours === null) continue;
        const idx = dayOfWeekMondayIndex(dateStr);
        if (idx !== null) hoursByDay[idx]! += hours;
      }
      const rows = DOW_LABELS.map((label, i) => ({
        date: label,
        hours: Math.round((hoursByDay[i] ?? 0) * 100) / 100,
      }));
      return {
        shape: "series",
        dimensions: ["day"],
        measures: ["hours"],
        rows,
        totals: { hours: Math.round(hoursByDay.reduce((a, b) => a + b, 0) * 100) / 100 },
        generatedAt,
        freshness: liveFreshness(),
        warnings,
        truncated: fetched.truncated,
      };
    }

    // ── Series: meetings / meeting-hours over time ─────────────────────────────
    const buckets = planBuckets(query.range.since, query.range.until);
    if (buckets.length === 0) {
      return {
        shape: "series",
        dimensions: ["date"],
        measures: ["count"],
        rows: [],
        totals: { count: 0 },
        generatedAt,
        freshness: liveFreshness(),
        warnings: [...warnings, "The selected date range is empty or invalid."],
        truncated: fetched.truncated,
      };
    }

    const isHours = query.metricKey === "meeting_hours_over_time";
    const measure = isHours ? "hours" : "count";
    const values = new Array<number>(buckets.length).fill(0);
    for (const ev of meetings) {
      const dateStr = eventStartDateStr(ev);
      if (dateStr === null) continue;
      const ms = dateStrToUtcMs(dateStr);
      if (ms === null) continue;
      const idx = bucketIndexForMs(buckets, ms);
      if (idx < 0) continue;
      if (isHours) {
        const hours = eventDurationHours(ev);
        if (hours !== null) values[idx]! += hours;
      } else {
        values[idx]! += 1;
      }
    }

    return seriesResult(buckets, values, measure, generatedAt, warnings, fetched.truncated, isHours);
  },
};
