/**
 * @jest-environment node
 *
 * Microsoft Outlook Calendar analytics adapter (Slice ANALYTICS-SOURCES-OUTLOOK-CAL-1):
 * per-viewer personal credential resolution (refreshable → refreshAndRetry),
 * privacy-safe count/hours-only metrics (only event times + all-day/cancelled
 * flags read), optional calendar picker (blank = primary), and typed, leak-free
 * error normalization. No network/DB — the credential repo, refreshAndRetry, and
 * the bounded reader are mocked.
 */

const mockGetIntegration = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  __esModule: true,
  getActiveForExecution: (...args: unknown[]) => mockGetIntegration(...args),
}));

const mockFetch = jest.fn();
jest.mock("@/services/analytics/sources/microsoft-outlook-calendar/api", () => ({
  __esModule: true,
  fetchCalendarEvents: (...args: unknown[]) => mockFetch(...args),
  MAX_EVENTS: 1500,
}));

const mockRefresh = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return { ...actual, refreshAndRetry: (input: unknown) => mockRefresh(input) };
});

import { microsoftOutlookCalendarAnalyticsSource } from "@/services/analytics/sources/microsoft-outlook-calendar";
import {
  AnalyticsSourceError,
  NormalizedAnalyticsResultSchema,
} from "@/services/analytics/sources/types";
import {
  IntegrationActionRequiredError,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";

const CTX = { accountId: "acct-1", userId: "user-1" };
const RANGE = { since: "2026-06-01T00:00:00Z", until: "2026-06-04T00:00:00Z" }; // 4 day-buckets

const EVENTS = [
  { startDateTime: "2026-06-01T09:00:00Z", endDateTime: "2026-06-01T10:00:00Z", isAllDay: false, isCancelled: false },
  { startDateTime: "2026-06-02T14:00:00Z", endDateTime: "2026-06-02T15:30:00Z", isAllDay: false, isCancelled: false },
  { startDateTime: "2026-06-01T00:00:00Z", endDateTime: "2026-06-02T00:00:00Z", isAllDay: true, isCancelled: false }, // all-day → excluded
  { startDateTime: "2026-06-03T11:00:00Z", endDateTime: "2026-06-03T12:00:00Z", isAllDay: false, isCancelled: true }, // cancelled → excluded
];

beforeEach(() => {
  jest.clearAllMocks();
  mockGetIntegration.mockResolvedValue({ providerAccountId: "user-1@outlook.com" });
  mockRefresh.mockImplementation((input: { apiCall: (t: string) => unknown }) => input.apiCall("tok"));
  mockFetch.mockResolvedValue({ events: EVENTS, truncated: false });
});

describe("metric registration", () => {
  it("exposes only the approved read-only metric set", () => {
    expect(microsoftOutlookCalendarAnalyticsSource.providerKey).toBe("microsoft-outlook-calendar");
    expect(microsoftOutlookCalendarAnalyticsSource.connectedApp).toBe(true);
    expect(microsoftOutlookCalendarAnalyticsSource.metrics.map((m) => m.key).sort()).toEqual([
      "busy_hours_by_day",
      "meeting_hours_over_time",
      "meetings_over_time",
      "upcoming_meetings_count",
    ]);
  });
});

describe("validation (no I/O before it passes)", () => {
  it("rejects an unknown metric", async () => {
    await expect(
      microsoftOutlookCalendarAnalyticsSource.query({ metricKey: "list_attendees", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "UNKNOWN_METRIC" });
    expect(mockGetIntegration).not.toHaveBeenCalled();
  });

  it("rejects a malformed calendar id before any I/O", async () => {
    await expect(
      microsoftOutlookCalendarAnalyticsSource.query(
        { metricKey: "meetings_over_time", range: RANGE, filters: { outlook_calendar: "bad id;" } },
        CTX,
      ),
    ).rejects.toMatchObject({ code: "INVALID_QUERY" });
    expect(mockGetIntegration).not.toHaveBeenCalled();
  });
});

describe("credential resolution (personal — viewer's own)", () => {
  it("pins to ctx.userId and refreshAndRetry uses that row's providerAccountId", async () => {
    await microsoftOutlookCalendarAnalyticsSource.query({ metricKey: "upcoming_meetings_count", range: RANGE }, CTX);
    expect(mockGetIntegration).toHaveBeenCalledWith("acct-1", "microsoft-outlook-calendar", null, {
      connectedByUserId: "user-1",
    });
    expect(mockRefresh.mock.calls[0]![0]).toMatchObject({
      accountId: "acct-1",
      provider: "microsoft-outlook-calendar",
      providerAccountId: "user-1@outlook.com",
    });
  });

  it("returns MISSING_CREDENTIAL when the viewer has no Outlook Calendar connection", async () => {
    mockGetIntegration.mockResolvedValue(null);
    await expect(
      microsoftOutlookCalendarAnalyticsSource.query({ metricKey: "upcoming_meetings_count", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});

describe("calendar filter (optional — blank = primary)", () => {
  it("passes calendarId=null when no calendar is selected", async () => {
    await microsoftOutlookCalendarAnalyticsSource.query({ metricKey: "meetings_over_time", range: RANGE }, CTX);
    expect(mockFetch.mock.calls[0]![1]).toBeNull();
  });

  it("passes the selected calendar id through", async () => {
    await microsoftOutlookCalendarAnalyticsSource.query(
      { metricKey: "meetings_over_time", range: RANGE, filters: { outlook_calendar: "AQcal_123" } },
      CTX,
    );
    expect(mockFetch.mock.calls[0]![1]).toBe("AQcal_123");
  });
});

describe("metrics (counts + hours, timed non-cancelled events only)", () => {
  it("upcoming_meetings_count counts timed, non-all-day, non-cancelled events", async () => {
    const r = await microsoftOutlookCalendarAnalyticsSource.query(
      { metricKey: "upcoming_meetings_count", range: RANGE },
      CTX,
    );
    expect(() => NormalizedAnalyticsResultSchema.parse(r)).not.toThrow();
    expect(r.totals).toEqual({ upcoming_meetings_count: 2 });
  });

  it("meetings_over_time buckets meetings by day", async () => {
    const r = await microsoftOutlookCalendarAnalyticsSource.query(
      { metricKey: "meetings_over_time", range: RANGE },
      CTX,
    );
    expect(r.shape).toBe("series");
    expect(r.rows).toHaveLength(4);
    expect(r.totals?.count).toBe(2);
  });

  it("meeting_hours_over_time sums durations", async () => {
    const r = await microsoftOutlookCalendarAnalyticsSource.query(
      { metricKey: "meeting_hours_over_time", range: RANGE },
      CTX,
    );
    expect(r.measures).toEqual(["hours"]);
    expect(r.totals?.hours).toBeCloseTo(2.5);
  });

  it("busy_hours_by_day returns 7 weekday rows summing total hours", async () => {
    const r = await microsoftOutlookCalendarAnalyticsSource.query(
      { metricKey: "busy_hours_by_day", range: RANGE },
      CTX,
    );
    expect(r.rows).toHaveLength(7);
    expect(r.totals?.hours).toBeCloseTo(2.5);
  });

  it("surfaces a truncation warning when the scan hit the cap", async () => {
    mockFetch.mockResolvedValue({ events: EVENTS, truncated: true });
    const r = await microsoftOutlookCalendarAnalyticsSource.query(
      { metricKey: "upcoming_meetings_count", range: RANGE },
      CTX,
    );
    expect(r.truncated).toBe(true);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("never surfaces sensitive event detail — only counts/hours + date labels", async () => {
    const r = await microsoftOutlookCalendarAnalyticsSource.query(
      { metricKey: "meetings_over_time", range: RANGE },
      CTX,
    );
    expect(JSON.stringify(r)).not.toMatch(/subject|attendee|organizer|location|body|webLink|onlineMeeting|@/i);
  });
});

describe("error normalization (typed, leak-free)", () => {
  it("IntegrationActionRequiredError → MISSING_CREDENTIAL", async () => {
    mockRefresh.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "acct-1",
        provider: "microsoft-outlook-calendar",
        providerAccountId: null,
        reason: "refresh_failed",
      }),
    );
    await expect(
      microsoftOutlookCalendarAnalyticsSource.query({ metricKey: "upcoming_meetings_count", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });
  });

  it("a leaked 401 → MISSING_CREDENTIAL", async () => {
    mockFetch.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      microsoftOutlookCalendarAnalyticsSource.query({ metricKey: "upcoming_meetings_count", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });
  });

  it("a not-found error → INVALID_QUERY (user-fixable)", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Microsoft Graph GET me/calendarView failed: ErrorItemNotFound"));
    await expect(
      microsoftOutlookCalendarAnalyticsSource.query({ metricKey: "meetings_over_time", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "INVALID_QUERY" });
  });

  it("a throttling error → RATE_LIMITED", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Microsoft Graph GET me/calendarView failed: 429 throttled"));
    await expect(
      microsoftOutlookCalendarAnalyticsSource.query({ metricKey: "upcoming_meetings_count", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("an unexpected error → generic PROVIDER_ERROR with no raw leak", async () => {
    mockFetch.mockRejectedValueOnce(new Error("secret-internal token=abc123 boom"));
    const err = await microsoftOutlookCalendarAnalyticsSource
      .query({ metricKey: "upcoming_meetings_count", range: RANGE }, CTX)
      .catch((e) => e);
    expect(err).toBeInstanceOf(AnalyticsSourceError);
    expect(err.code).toBe("PROVIDER_ERROR");
    expect(err.message).not.toMatch(/secret-internal|token=abc123/);
  });
});
