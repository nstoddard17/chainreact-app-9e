/**
 * @jest-environment node
 *
 * Bounded, aggregate-only GA4 Data API reader for the analytics source (Slice
 * ANALYTICS-SOURCES-GA-1): verifies it requests ONLY the allow-listed metric (no
 * dimension for scalars, `date` only for series), parses scalar totals + daily
 * points, drops malformed / `(other)` date rows, and flags truncation. The shared
 * `runReport` wrapper is mocked — no network.
 */

const mockRunReport = jest.fn();
jest.mock("@/integrations/_shared/google/api/analytics/runReport", () => ({
  __esModule: true,
  runReport: (...a: unknown[]) => mockRunReport(...a),
}));

import { gaScalar, gaSeries, SERIES_ROW_LIMIT } from "@/services/analytics/sources/google-analytics/api";

beforeEach(() => jest.clearAllMocks());

describe("gaScalar", () => {
  it("requests one metric with NO dimension and returns the parsed total", async () => {
    mockRunReport.mockResolvedValue({ rows: [{ metricValues: [{ value: "4242" }] }] });
    const v = await gaScalar({
      accessToken: "tok",
      propertyId: "123",
      metric: "activeUsers",
      startDate: "2026-06-01",
      endDate: "2026-06-07",
    });
    expect(v).toBe(4242);
    const input = mockRunReport.mock.calls[0]![0];
    expect(input.metrics).toEqual(["activeUsers"]);
    expect(input.dimensions).toBeUndefined();
    expect(input.propertyId).toBe("123");
  });

  it("falls back to totals[] then to 0 when there are no rows", async () => {
    mockRunReport.mockResolvedValue({ totals: [{ metricValues: [{ value: "9" }] }] });
    expect(await gaScalar({ accessToken: "t", propertyId: "1", metric: "sessions", startDate: "a", endDate: "b" })).toBe(9);
    mockRunReport.mockResolvedValue({});
    expect(await gaScalar({ accessToken: "t", propertyId: "1", metric: "sessions", startDate: "a", endDate: "b" })).toBe(0);
  });
});

describe("gaSeries", () => {
  it("requests the `date` dimension + a bounded limit and parses daily points", async () => {
    mockRunReport.mockResolvedValue({
      rows: [
        { dimensionValues: [{ value: "20260601" }], metricValues: [{ value: "10" }] },
        { dimensionValues: [{ value: "20260602" }], metricValues: [{ value: "20" }] },
      ],
      rowCount: 2,
    });
    const r = await gaSeries({ accessToken: "t", propertyId: "9", metric: "sessions", startDate: "a", endDate: "b" });
    expect(r.points).toEqual([
      { dateMs: Date.UTC(2026, 5, 1), value: 10 },
      { dateMs: Date.UTC(2026, 5, 2), value: 20 },
    ]);
    expect(r.truncated).toBe(false);
    const input = mockRunReport.mock.calls[0]![0];
    expect(input.dimensions).toEqual(["date"]);
    expect(input.limit).toBe(SERIES_ROW_LIMIT);
  });

  it("drops malformed / `(other)` date rows", async () => {
    mockRunReport.mockResolvedValue({
      rows: [
        { dimensionValues: [{ value: "20260601" }], metricValues: [{ value: "5" }] },
        { dimensionValues: [{ value: "(other)" }], metricValues: [{ value: "999" }] },
      ],
      rowCount: 2,
    });
    const r = await gaSeries({ accessToken: "t", propertyId: "9", metric: "eventCount", startDate: "a", endDate: "b" });
    expect(r.points).toEqual([{ dateMs: Date.UTC(2026, 5, 1), value: 5 }]);
  });

  it("flags truncation when GA reports more rows than fetched", async () => {
    mockRunReport.mockResolvedValue({
      rows: [{ dimensionValues: [{ value: "20260601" }], metricValues: [{ value: "1" }] }],
      rowCount: 800,
    });
    const r = await gaSeries({ accessToken: "t", propertyId: "9", metric: "sessions", startDate: "a", endDate: "b" });
    expect(r.truncated).toBe(true);
  });
});
