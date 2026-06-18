/**
 * @jest-environment node
 *
 * Source query path (Slice ANALYTICS-SOURCES-GITHUB-1): validates everything
 * against the registry before touching an adapter; unknown provider/metric,
 * bad range/groupBy/filter all become typed errors. Delegation is proven through
 * the real registry via the internal source (overview mocked).
 */

jest.mock("@/services/analytics/analyticsOverview", () => ({
  getAnalyticsOverview: jest.fn(),
}));

import { queryAnalyticsSource } from "@/services/analytics/sources/querySource";
import { getAnalyticsOverview } from "@/services/analytics/analyticsOverview";
import type { AnalyticsOverview } from "@/contracts/analytics";

const mockOverview = getAnalyticsOverview as jest.MockedFunction<typeof getAnalyticsOverview>;
const CTX = { accountId: "acct-1", userId: "user-1" };
const RANGE = { since: "2026-06-01T00:00:00Z", until: "2026-06-08T00:00:00Z" };

const OVERVIEW: AnalyticsOverview = {
  range: { id: "7d", since: RANGE.since, until: RANGE.until },
  totals: { runs: 10, succeeded: 9, failed: 1, successRate: 0.9, avgDurationMs: 100, activeWorkflows: 1, totalWorkflows: 2, connectedApps: 1 },
  previousTotals: { runs: 8, succeeded: 8, failed: 0, successRate: 1, avgDurationMs: 90, activeWorkflows: 1, totalWorkflows: 2, connectedApps: 1 },
  runsOverTime: [],
  workflows: [],
  apps: [],
  heatmap: { weeks: 16, cells: [], maxCell: 0, total: 0 },
  recentRuns: [],
  truncated: false,
};

beforeEach(() => jest.clearAllMocks());

describe("queryAnalyticsSource validation", () => {
  it("rejects an unknown provider", async () => {
    await expect(
      queryAnalyticsSource({ providerKey: "nope", metricKey: "x", range: RANGE, context: CTX }),
    ).rejects.toMatchObject({ code: "UNKNOWN_SOURCE" });
  });

  it("rejects an unknown metric for a known provider", async () => {
    await expect(
      queryAnalyticsSource({ providerKey: "github", metricKey: "delete_repo", range: RANGE, context: CTX }),
    ).rejects.toMatchObject({ code: "UNKNOWN_METRIC" });
  });

  it("rejects an invalid date range", async () => {
    await expect(
      queryAnalyticsSource({
        providerKey: "github",
        metricKey: "open_issues",
        range: { since: "2026-06-08T00:00:00Z", until: "2026-06-01T00:00:00Z" },
        filters: { repo: "o/n" },
        context: CTX,
      }),
    ).rejects.toMatchObject({ code: "INVALID_QUERY" });
  });

  it("rejects an unsupported group-by", async () => {
    await expect(
      queryAnalyticsSource({
        providerKey: "github",
        metricKey: "issues_opened",
        range: RANGE,
        groupBy: "year",
        filters: { repo: "o/n" },
        context: CTX,
      }),
    ).rejects.toMatchObject({ code: "INVALID_QUERY" });
  });

  it("rejects an unsupported filter key (no arbitrary params)", async () => {
    await expect(
      queryAnalyticsSource({
        providerKey: "github",
        metricKey: "open_issues",
        range: RANGE,
        filters: { repo: "o/n", evil: "1" },
        context: CTX,
      }),
    ).rejects.toMatchObject({ code: "INVALID_QUERY" });
  });
});

describe("queryAnalyticsSource delegation", () => {
  it("delegates to the registered adapter and returns its normalized result", async () => {
    mockOverview.mockResolvedValueOnce(OVERVIEW);
    const r = await queryAnalyticsSource({
      providerKey: "internal",
      metricKey: "success_rate",
      range: RANGE,
      context: CTX,
    });
    expect(mockOverview).toHaveBeenCalledWith("acct-1", "7d");
    expect(r.shape).toBe("scalar");
    expect(r.totals).toEqual({ success_rate: 90 });
  });
});
