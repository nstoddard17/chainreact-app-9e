jest.mock("@/services/analytics/analyticsOverview", () => ({
  getAnalyticsOverview: jest.fn(),
}));

import {
  internalAnalyticsSource,
  overviewToNormalized,
  rangeToPreset,
} from "@/services/analytics/sources/internal";
import {
  AnalyticsSourceError,
  NormalizedAnalyticsResultSchema,
} from "@/services/analytics/sources/types";
import { getAnalyticsOverview } from "@/services/analytics/analyticsOverview";
import type { AnalyticsOverview } from "@/contracts/analytics";

const mockOverview = getAnalyticsOverview as jest.MockedFunction<typeof getAnalyticsOverview>;

const OVERVIEW: AnalyticsOverview = {
  range: { id: "7d", since: "2026-06-10T00:00:00Z", until: "2026-06-17T00:00:00Z" },
  totals: {
    runs: 100,
    succeeded: 98,
    failed: 2,
    successRate: 0.98,
    avgDurationMs: 120,
    activeWorkflows: 4,
    totalWorkflows: 6,
    connectedApps: 2,
  },
  previousTotals: {
    runs: 80,
    succeeded: 70,
    failed: 10,
    successRate: 0.875,
    avgDurationMs: 140,
    activeWorkflows: 4,
    totalWorkflows: 6,
    connectedApps: 2,
  },
  runsOverTime: [
    { date: "2026-06-15", succeeded: 40, failed: 1 },
    { date: "2026-06-16", succeeded: 58, failed: 1 },
  ],
  workflows: [
    { workflowId: "11111111-1111-1111-1111-111111111111", name: "Welcome flow", runs: 60, succeeded: 59, successRate: 59 / 60, avgDurationMs: 100 },
    { workflowId: "22222222-2222-2222-2222-222222222222", name: "Invoice reminders", runs: 40, succeeded: 39, successRate: 39 / 40, avgDurationMs: 150 },
  ],
  apps: [{ provider: "slack", label: "Slack", connections: 2 }],
  heatmap: { weeks: 16, cells: [], maxCell: 0, total: 100 },
  recentRuns: [],
  truncated: false,
};

const AT = "2026-06-17T12:00:00Z";

describe("rangeToPreset", () => {
  it("maps windows to the nearest internal preset", () => {
    const day = 86_400_000;
    const base = Date.parse("2026-06-01T00:00:00Z");
    const iso = (ms: number) => new Date(ms).toISOString();
    expect(rangeToPreset(iso(base), iso(base + day))).toBe("today");
    expect(rangeToPreset(iso(base), iso(base + 7 * day))).toBe("7d");
    expect(rangeToPreset(iso(base), iso(base + 30 * day))).toBe("30d");
    expect(rangeToPreset(iso(base), iso(base + 90 * day))).toBe("90d");
    expect(rangeToPreset(iso(base), iso(base + 200 * day))).toBe("ytd");
    expect(rangeToPreset("bad", "worse")).toBe("7d"); // safe default
  });
});

describe("overviewToNormalized", () => {
  it("produces a schema-valid series for runs_over_time", () => {
    const r = overviewToNormalized(OVERVIEW, "runs_over_time", AT);
    expect(() => NormalizedAnalyticsResultSchema.parse(r)).not.toThrow();
    expect(r.shape).toBe("series");
    expect(r.dimensions).toEqual(["date"]);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({ date: "2026-06-15", succeeded: 40, failed: 1 });
  });

  it("produces a schema-valid scalar for success_rate", () => {
    const r = overviewToNormalized(OVERVIEW, "success_rate", AT);
    expect(() => NormalizedAnalyticsResultSchema.parse(r)).not.toThrow();
    expect(r.shape).toBe("scalar");
    expect(r.totals).toEqual({ success_rate: 98 });
  });

  it("produces a schema-valid breakdown for top_workflows", () => {
    const r = overviewToNormalized(OVERVIEW, "top_workflows", AT);
    expect(() => NormalizedAnalyticsResultSchema.parse(r)).not.toThrow();
    expect(r.shape).toBe("breakdown");
    expect(r.rows[0]).toMatchObject({ workflow: "Welcome flow", runs: 60 });
  });

  it("throws a typed error for an unknown metric", () => {
    expect(() => overviewToNormalized(OVERVIEW, "nope", AT)).toThrow(AnalyticsSourceError);
  });
});

describe("internalAnalyticsSource.query", () => {
  beforeEach(() => jest.clearAllMocks());

  it("is account-scoped, read-only, and returns a normalized result", async () => {
    mockOverview.mockResolvedValueOnce(OVERVIEW);
    const result = await internalAnalyticsSource.query(
      { metricKey: "runs_over_time", range: { since: "2026-06-10T00:00:00Z", until: "2026-06-17T00:00:00Z" } },
      { accountId: "acct-1", userId: "user-1" },
    );
    expect(mockOverview).toHaveBeenCalledWith("acct-1", "7d");
    expect(() => NormalizedAnalyticsResultSchema.parse(result)).not.toThrow();
    expect(result.freshness.cached).toBe(false);
  });

  it("rejects an unknown metric before any data fetch", async () => {
    await expect(
      internalAnalyticsSource.query(
        { metricKey: "evil", range: { since: "2026-06-10T00:00:00Z", until: "2026-06-17T00:00:00Z" } },
        { accountId: "acct-1", userId: "user-1" },
      ),
    ).rejects.toBeInstanceOf(AnalyticsSourceError);
    expect(mockOverview).not.toHaveBeenCalled();
  });
});
