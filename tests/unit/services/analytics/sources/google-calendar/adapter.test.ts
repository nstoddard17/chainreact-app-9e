/**
 * @jest-environment node
 *
 * Google Calendar analytics adapter (Slice ANALYTICS-SOURCES-GCAL-1):
 * per-viewer personal credential resolution (refreshable → refreshAndRetry),
 * privacy-safe metric computation (counts/hours only), and typed, leak-free error
 * normalization. No network/DB — the credential repo, refreshAndRetry, and the
 * bounded events reader are mocked.
 */

const mockGetIntegration = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  __esModule: true,
  getActiveForExecution: (...args: unknown[]) => mockGetIntegration(...args),
}));

const mockFetchEvents = jest.fn();
jest.mock("@/services/analytics/sources/google-calendar/api", () => ({
  __esModule: true,
  fetchCalendarEvents: (...args: unknown[]) => mockFetchEvents(...args),
  MAX_EVENTS: 1500,
}));

const mockRefresh = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return { ...actual, refreshAndRetry: (input: unknown) => mockRefresh(input) };
});

import { googleCalendarAnalyticsSource } from "@/services/analytics/sources/google-calendar";
import {
  AnalyticsSourceError,
  NormalizedAnalyticsResultSchema,
} from "@/services/analytics/sources/types";
import {
  IntegrationActionRequiredError,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import { NotFoundError } from "@/integrations/google-calendar/api/errors";

const CTX = { accountId: "acct-1", userId: "user-1" };
const RANGE = { since: "2026-06-01T00:00:00Z", until: "2026-06-04T00:00:00Z" };
const CAL = { calendar: "primary" };

function meeting(start: string, end: string) {
  return { startDateTime: start, endDateTime: end, status: "confirmed" };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetIntegration.mockResolvedValue({ providerAccountId: "user-1@example.com", accessTokenEncrypted: "enc" });
  mockRefresh.mockImplementation((input: { apiCall: (t: string) => unknown }) => input.apiCall("access-tok"));
  mockFetchEvents.mockResolvedValue({ events: [], truncated: false });
});

describe("metric registration", () => {
  it("exposes only the approved read-only metric set", () => {
    expect(googleCalendarAnalyticsSource.providerKey).toBe("google-calendar");
    expect(googleCalendarAnalyticsSource.connectedApp).toBe(true);
    expect(googleCalendarAnalyticsSource.metrics.map((m) => m.key).sort()).toEqual([
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
      googleCalendarAnalyticsSource.query({ metricKey: "list_attendees", range: RANGE, filters: CAL }, CTX),
    ).rejects.toMatchObject({ code: "UNKNOWN_METRIC" });
    expect(mockGetIntegration).not.toHaveBeenCalled();
  });

  it("rejects an invalid calendar id before resolving credentials", async () => {
    await expect(
      googleCalendarAnalyticsSource.query(
        { metricKey: "meetings_over_time", range: RANGE, filters: { calendar: "has space" } },
        CTX,
      ),
    ).rejects.toMatchObject({ code: "INVALID_QUERY" });
    expect(mockGetIntegration).not.toHaveBeenCalled();
  });
});

describe("credential resolution (personal — viewer's own connection)", () => {
  it("resolves pinned to ctx.userId and refreshAndRetry uses that row's providerAccountId", async () => {
    await googleCalendarAnalyticsSource.query(
      { metricKey: "meetings_over_time", range: RANGE, filters: CAL },
      CTX,
    );
    expect(mockGetIntegration).toHaveBeenCalledWith("acct-1", "google-calendar", null, {
      connectedByUserId: "user-1",
    });
    expect(mockRefresh.mock.calls[0]![0]).toMatchObject({
      accountId: "acct-1",
      provider: "google-calendar",
      providerAccountId: "user-1@example.com",
    });
  });

  it("returns MISSING_CREDENTIAL when the viewer has no Calendar connection", async () => {
    mockGetIntegration.mockResolvedValue(null);
    await expect(
      googleCalendarAnalyticsSource.query({ metricKey: "meetings_over_time", range: RANGE, filters: CAL }, CTX),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});

describe("metrics", () => {
  it("upcoming_meetings_count counts timed meetings in a FORWARD window", async () => {
    mockFetchEvents.mockResolvedValue({
      events: [
        meeting("2026-06-05T10:00:00Z", "2026-06-05T11:00:00Z"),
        meeting("2026-06-06T09:00:00Z", "2026-06-06T09:30:00Z"),
        { status: "confirmed" }, // all-day → not a meeting
      ],
      truncated: false,
    });
    const r = await googleCalendarAnalyticsSource.query(
      { metricKey: "upcoming_meetings_count", range: RANGE, filters: CAL },
      CTX,
    );
    expect(() => NormalizedAnalyticsResultSchema.parse(r)).not.toThrow();
    expect(r.shape).toBe("scalar");
    expect(r.totals).toEqual({ upcoming_meetings_count: 2 });
    // Forward window: timeMin == range.until, timeMax == until + (until - since).
    const [, , timeMin, timeMax] = mockFetchEvents.mock.calls[0]!;
    expect(timeMin).toBe(new Date(Date.parse(RANGE.until)).toISOString());
    const expectedMax = new Date(
      Date.parse(RANGE.until) + (Date.parse(RANGE.until) - Date.parse(RANGE.since)),
    ).toISOString();
    expect(timeMax).toBe(expectedMax);
  });

  it("meetings_over_time buckets by day over the historical window", async () => {
    mockFetchEvents.mockResolvedValue({
      events: [
        meeting("2026-06-01T10:00:00Z", "2026-06-01T11:00:00Z"),
        meeting("2026-06-02T10:00:00Z", "2026-06-02T11:00:00Z"),
        meeting("2026-06-02T14:00:00Z", "2026-06-02T15:00:00Z"),
      ],
      truncated: false,
    });
    const r = await googleCalendarAnalyticsSource.query(
      { metricKey: "meetings_over_time", range: RANGE, filters: CAL },
      CTX,
    );
    expect(() => NormalizedAnalyticsResultSchema.parse(r)).not.toThrow();
    expect(r.shape).toBe("series");
    expect(r.totals?.count).toBe(3);
    expect(r.rows.find((row) => row.date === "2026-06-02")?.count).toBe(2);
    // Historical window passed to the fetch (not forward).
    const [, , timeMin] = mockFetchEvents.mock.calls[0]!;
    expect(timeMin).toBe(RANGE.since);
  });

  it("meeting_hours_over_time sums durations per bucket", async () => {
    mockFetchEvents.mockResolvedValue({
      events: [
        meeting("2026-06-01T10:00:00Z", "2026-06-01T11:30:00Z"), // 1.5h
        meeting("2026-06-01T13:00:00Z", "2026-06-01T14:00:00Z"), // 1h
      ],
      truncated: false,
    });
    const r = await googleCalendarAnalyticsSource.query(
      { metricKey: "meeting_hours_over_time", range: RANGE, filters: CAL },
      CTX,
    );
    expect(r.measures).toEqual(["hours"]);
    expect(r.totals?.hours).toBeCloseTo(2.5);
    expect(r.rows.find((row) => row.date === "2026-06-01")?.hours).toBeCloseTo(2.5);
  });

  it("busy_hours_by_day returns 7 Mon-first weekday rows of hours", async () => {
    mockFetchEvents.mockResolvedValue({
      // 2026-06-15 is a Monday; 2026-06-16 a Tuesday.
      events: [
        meeting("2026-06-15T10:00:00Z", "2026-06-15T12:00:00Z"), // Mon 2h
        meeting("2026-06-16T10:00:00Z", "2026-06-16T11:00:00Z"), // Tue 1h
      ],
      truncated: false,
    });
    const r = await googleCalendarAnalyticsSource.query(
      { metricKey: "busy_hours_by_day", range: RANGE, filters: CAL },
      CTX,
    );
    expect(() => NormalizedAnalyticsResultSchema.parse(r)).not.toThrow();
    expect(r.rows).toHaveLength(7);
    expect(r.rows.map((row) => row.date)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    expect(r.rows[0]!.hours).toBeCloseTo(2);
    expect(r.rows[1]!.hours).toBeCloseTo(1);
    expect(r.totals?.hours).toBeCloseTo(3);
  });

  it("surfaces a truncation warning when the calendar had more than the cap", async () => {
    mockFetchEvents.mockResolvedValue({
      events: [meeting("2026-06-01T10:00:00Z", "2026-06-01T11:00:00Z")],
      truncated: true,
    });
    const r = await googleCalendarAnalyticsSource.query(
      { metricKey: "meetings_over_time", range: RANGE, filters: CAL },
      CTX,
    );
    expect(r.truncated).toBe(true);
    expect(r.warnings.some((w) => /first 1500 events/i.test(w))).toBe(true);
  });

  it("never surfaces sensitive event detail — only numeric counts/hours + date/day labels", async () => {
    mockFetchEvents.mockResolvedValue({
      events: [meeting("2026-06-01T10:00:00Z", "2026-06-01T11:00:00Z")],
      truncated: false,
    });
    const r = await googleCalendarAnalyticsSource.query(
      { metricKey: "meetings_over_time", range: RANGE, filters: CAL },
      CTX,
    );
    const json = JSON.stringify(r);
    expect(json).not.toMatch(/summary|attendee|description|hangoutLink|location|email/i);
  });
});

describe("error normalization (typed, leak-free)", () => {
  it("refreshAndRetry IntegrationActionRequiredError → MISSING_CREDENTIAL", async () => {
    mockRefresh.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "acct-1",
        provider: "google-calendar",
        providerAccountId: null,
        reason: "refresh_failed",
      }),
    );
    await expect(
      googleCalendarAnalyticsSource.query({ metricKey: "meetings_over_time", range: RANGE, filters: CAL }, CTX),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });
  });

  it("a leaked 401 → MISSING_CREDENTIAL", async () => {
    mockFetchEvents.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      googleCalendarAnalyticsSource.query({ metricKey: "meetings_over_time", range: RANGE, filters: CAL }, CTX),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });
  });

  it("a not-found calendar → INVALID_QUERY (user-fixable, non-transient)", async () => {
    mockFetchEvents.mockRejectedValueOnce(new NotFoundError("calendar", "Not Found"));
    await expect(
      googleCalendarAnalyticsSource.query({ metricKey: "meetings_over_time", range: RANGE, filters: CAL }, CTX),
    ).rejects.toMatchObject({ code: "INVALID_QUERY" });
  });

  it("a rate-limit error → RATE_LIMITED", async () => {
    mockFetchEvents.mockRejectedValueOnce(new Error("events.list failed: Rate Limit Exceeded"));
    await expect(
      googleCalendarAnalyticsSource.query({ metricKey: "meetings_over_time", range: RANGE, filters: CAL }, CTX),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("an unexpected error → generic PROVIDER_ERROR with no raw leak", async () => {
    mockFetchEvents.mockRejectedValueOnce(new Error("secret-internal token=abc123 boom"));
    const err = await googleCalendarAnalyticsSource
      .query({ metricKey: "meetings_over_time", range: RANGE, filters: CAL }, CTX)
      .catch((e) => e);
    expect(err).toBeInstanceOf(AnalyticsSourceError);
    expect(err.code).toBe("PROVIDER_ERROR");
    expect(err.message).not.toMatch(/secret-internal|token=abc123/);
  });
});
