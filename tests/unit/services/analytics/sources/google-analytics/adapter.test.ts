/**
 * @jest-environment node
 *
 * Google Analytics (GA4) analytics adapter (Slice ANALYTICS-SOURCES-GA-1): per-viewer
 * personal credential resolution (refreshable → refreshAndRetry), aggregate-only metrics
 * (active/total users, sessions, page views, events as scalars + the same over time via
 * the GA `date` dimension bucketed into the dashboard plan), required property validation
 * before any I/O, and typed, leak-free error normalization. No network/DB — the credential
 * repo, refreshAndRetry, and the GA Data API reader are mocked.
 */

const mockGetIntegration = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  __esModule: true,
  getActiveForExecution: (...args: unknown[]) => mockGetIntegration(...args),
}));

const mockScalar = jest.fn();
const mockSeries = jest.fn();
jest.mock("@/services/analytics/sources/google-analytics/api", () => {
  const actual = jest.requireActual("@/services/analytics/sources/google-analytics/api");
  return {
    ...actual,
    gaScalar: (...a: unknown[]) => mockScalar(...a),
    gaSeries: (...a: unknown[]) => mockSeries(...a),
  };
});

const mockRefresh = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return { ...actual, refreshAndRetry: (input: { apiCall: (t: string) => unknown }) => mockRefresh(input) };
});

import { googleAnalyticsAnalyticsSource } from "@/services/analytics/sources/google-analytics";
import {
  AnalyticsSourceError,
  NormalizedAnalyticsResultSchema,
} from "@/services/analytics/sources/types";
import {
  IntegrationActionRequiredError,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import {
  AnalyticsApiError,
  AnalyticsNotFoundError,
  AnalyticsQuotaError,
} from "@/integrations/_shared/google/api/analytics/errors";

const CTX = { accountId: "acct-1", userId: "user-1" };
const RANGE = { since: "2026-06-01T00:00:00Z", until: "2026-06-04T00:00:00Z" }; // 4 day-buckets
const PROPERTY = "123456789";
const PROP_F = { ga_property: PROPERTY };
const ms = (iso: string) => Date.parse(iso);

beforeEach(() => {
  jest.clearAllMocks();
  mockGetIntegration.mockResolvedValue({ providerAccountId: "ga-user-1" });
  mockRefresh.mockImplementation((input: { apiCall: (t: string) => unknown }) => input.apiCall("tok"));
  mockScalar.mockResolvedValue(4242);
  mockSeries.mockResolvedValue({
    points: [
      { dateMs: ms("2026-06-02T00:00:00Z"), value: 10 },
      { dateMs: ms("2026-06-03T00:00:00Z"), value: 5 },
      { dateMs: ms("2026-05-15T00:00:00Z"), value: 99 }, // out of range → dropped
    ],
    truncated: false,
  });
});

describe("metric registration", () => {
  it("exposes the approved aggregate-only metric set, all property-scoped", () => {
    expect(googleAnalyticsAnalyticsSource.providerKey).toBe("google-analytics");
    expect(googleAnalyticsAnalyticsSource.connectedApp).toBe(true);
    expect(googleAnalyticsAnalyticsSource.metrics.map((m) => m.key).sort()).toEqual([
      "active_users",
      "active_users_over_time",
      "event_count",
      "event_count_over_time",
      "screen_page_views",
      "screen_page_views_over_time",
      "sessions",
      "sessions_over_time",
      "total_users",
    ]);
    for (const m of googleAnalyticsAnalyticsSource.metrics) {
      expect(m.supportedFilters).toEqual(["ga_property"]);
      expect(m.supportedGroupBy).toEqual([]);
    }
  });
});

describe("validation (no I/O before it passes)", () => {
  it("rejects an unknown metric", async () => {
    await expect(
      googleAnalyticsAnalyticsSource.query({ metricKey: "run_report", range: RANGE, filters: PROP_F }, CTX),
    ).rejects.toMatchObject({ code: "UNKNOWN_METRIC" });
    expect(mockGetIntegration).not.toHaveBeenCalled();
  });

  it("rejects a missing property id before any I/O", async () => {
    await expect(
      googleAnalyticsAnalyticsSource.query({ metricKey: "sessions", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "INVALID_QUERY" });
    expect(mockGetIntegration).not.toHaveBeenCalled();
  });

  it("rejects a malformed property id before any I/O", async () => {
    await expect(
      googleAnalyticsAnalyticsSource.query(
        { metricKey: "sessions", range: RANGE, filters: { ga_property: "properties/123" } },
        CTX,
      ),
    ).rejects.toMatchObject({ code: "INVALID_QUERY" });
    expect(mockGetIntegration).not.toHaveBeenCalled();
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});

describe("credential resolution (personal — viewer's own)", () => {
  it("pins to ctx.userId and refreshAndRetry uses that row's providerAccountId", async () => {
    await googleAnalyticsAnalyticsSource.query({ metricKey: "active_users", range: RANGE, filters: PROP_F }, CTX);
    expect(mockGetIntegration).toHaveBeenCalledWith("acct-1", "google-analytics", null, {
      connectedByUserId: "user-1",
    });
    expect(mockRefresh.mock.calls[0]![0]).toMatchObject({
      accountId: "acct-1",
      provider: "google-analytics",
      providerAccountId: "ga-user-1",
    });
  });

  it("returns MISSING_CREDENTIAL when the viewer has no GA connection", async () => {
    mockGetIntegration.mockResolvedValue(null);
    await expect(
      googleAnalyticsAnalyticsSource.query({ metricKey: "active_users", range: RANGE, filters: PROP_F }, CTX),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });
    expect(mockScalar).not.toHaveBeenCalled();
  });
});

describe("metrics", () => {
  it("active_users returns the scalar total for the property", async () => {
    const r = await googleAnalyticsAnalyticsSource.query({ metricKey: "active_users", range: RANGE, filters: PROP_F }, CTX);
    expect(() => NormalizedAnalyticsResultSchema.parse(r)).not.toThrow();
    expect(r.shape).toBe("scalar");
    expect(r.totals).toEqual({ active_users: 4242 });
    expect(mockScalar.mock.calls[0]![0]).toMatchObject({ propertyId: PROPERTY, metric: "activeUsers" });
    expect(mockSeries).not.toHaveBeenCalled();
  });

  it("maps each scalar metric key to its GA4 metric name", async () => {
    const cases: Array<[string, string]> = [
      ["total_users", "totalUsers"],
      ["sessions", "sessions"],
      ["screen_page_views", "screenPageViews"],
      ["event_count", "eventCount"],
    ];
    for (const [key, gaMetric] of cases) {
      mockScalar.mockClear();
      await googleAnalyticsAnalyticsSource.query({ metricKey: key, range: RANGE, filters: PROP_F }, CTX);
      expect(mockScalar.mock.calls[0]![0]).toMatchObject({ metric: gaMetric });
    }
  });

  it("sessions_over_time buckets GA daily points (out-of-range dropped)", async () => {
    const r = await googleAnalyticsAnalyticsSource.query(
      { metricKey: "sessions_over_time", range: RANGE, filters: PROP_F },
      CTX,
    );
    expect(r.shape).toBe("series");
    expect(r.rows).toHaveLength(4);
    expect(r.rows.map((row) => row.count)).toEqual([0, 10, 5, 0]); // 06-02=10, 06-03=5 (05-15 out)
    expect(r.totals?.count).toBe(15);
    expect(mockSeries.mock.calls[0]![0]).toMatchObject({ propertyId: PROPERTY, metric: "sessions" });
  });

  it("surfaces a truncation warning when GA reported more rows than fetched", async () => {
    mockSeries.mockResolvedValue({ points: [{ dateMs: ms("2026-06-02T00:00:00Z"), value: 3 }], truncated: true });
    const r = await googleAnalyticsAnalyticsSource.query(
      { metricKey: "event_count_over_time", range: RANGE, filters: PROP_F },
      CTX,
    );
    expect(r.truncated).toBe(true);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("never surfaces the property id, a user/client id, page path, or url", async () => {
    const r = await googleAnalyticsAnalyticsSource.query(
      { metricKey: "active_users_over_time", range: RANGE, filters: PROP_F },
      CTX,
    );
    expect(JSON.stringify(r)).not.toContain(PROPERTY);
    expect(JSON.stringify(r)).not.toMatch(/userId|clientId|pagePath|searchTerm|http|api_secret/i);
  });
});

describe("error normalization (typed, leak-free)", () => {
  it("IntegrationActionRequiredError → MISSING_CREDENTIAL", async () => {
    mockRefresh.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "acct-1",
        provider: "google-analytics",
        providerAccountId: "ga-user-1",
        reason: "refresh_failed",
      }),
    );
    await expect(
      googleAnalyticsAnalyticsSource.query({ metricKey: "active_users", range: RANGE, filters: PROP_F }, CTX),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });
  });

  it("a leaked 401 → MISSING_CREDENTIAL", async () => {
    mockScalar.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      googleAnalyticsAnalyticsSource.query({ metricKey: "active_users", range: RANGE, filters: PROP_F }, CTX),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });
  });

  it("a property AnalyticsNotFoundError → INVALID_QUERY (user-fixable)", async () => {
    mockScalar.mockRejectedValueOnce(new AnalyticsNotFoundError("property 123456789"));
    await expect(
      googleAnalyticsAnalyticsSource.query({ metricKey: "sessions", range: RANGE, filters: PROP_F }, CTX),
    ).rejects.toMatchObject({ code: "INVALID_QUERY" });
  });

  it("a quota error → RATE_LIMITED", async () => {
    mockScalar.mockRejectedValueOnce(new AnalyticsQuotaError("RESOURCE_EXHAUSTED"));
    await expect(
      googleAnalyticsAnalyticsSource.query({ metricKey: "sessions", range: RANGE, filters: PROP_F }, CTX),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("a generic GA API error → PROVIDER_ERROR with no raw leak", async () => {
    mockScalar.mockRejectedValueOnce(new AnalyticsApiError("INVALID_ARGUMENT", 400));
    const err = await googleAnalyticsAnalyticsSource
      .query({ metricKey: "sessions", range: RANGE, filters: PROP_F }, CTX)
      .catch((e) => e);
    expect(err).toBeInstanceOf(AnalyticsSourceError);
    expect(err.code).toBe("PROVIDER_ERROR");
    expect(err.message).not.toMatch(/INVALID_ARGUMENT/);
  });

  it("an unexpected error → generic PROVIDER_ERROR with no raw leak", async () => {
    mockScalar.mockRejectedValueOnce(new Error("secret-internal token=abc123 boom"));
    const err = await googleAnalyticsAnalyticsSource
      .query({ metricKey: "sessions", range: RANGE, filters: PROP_F }, CTX)
      .catch((e) => e);
    expect(err).toBeInstanceOf(AnalyticsSourceError);
    expect(err.code).toBe("PROVIDER_ERROR");
    expect(err.message).not.toMatch(/secret-internal|token=abc123/);
  });
});
