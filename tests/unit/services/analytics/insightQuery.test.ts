/**
 * ANALYTICS-FLEXIBILITY-CS-1 — the flexible query service. Repositories are
 * mocked at the module boundary; the windowing, bucketing, series assembly,
 * ownership validation, and normalization logic under test are real.
 */
import {
  AnalyticsQuerySchema,
  type AnalyticsQuery,
} from "@/contracts/analyticsQuery";

const mockAggregateRuns = jest.fn();
jest.mock("@/repositories/analytics/queries", () => ({
  aggregateRuns: (...args: unknown[]) => mockAggregateRuns(...args),
}));

const mockListByIdsForAccount = jest.fn();
jest.mock("@/repositories/workflows", () => ({
  listByIdsForAccount: (...args: unknown[]) => mockListByIdsForAccount(...args),
}));

import {
  UNKNOWN_WORKFLOW_MESSAGE,
  runAnalyticsQuery,
} from "@/services/analytics/insightQuery";
import {
  bucketStartsFor,
  resolveQueryRange,
  resolveTimeGrain,
} from "@/services/analytics/insightQueryTime";

const ACCOUNT = "acct-1";
const NOW = Date.parse("2026-07-15T12:00:00.000Z");
const DAY = 86_400_000;
const WF_A = "11111111-1111-4111-8111-111111111111";
const WF_B = "22222222-2222-4222-8222-222222222222";
const WF_C = "33333333-3333-4333-8333-333333333333";

function q(body: Record<string, unknown>): AnalyticsQuery {
  return AnalyticsQuerySchema.parse(body);
}

interface AggRow {
  bucketStart: string | null;
  groupKey: string | null;
  runs: number;
  succeeded: number;
  failed: number;
  durSumMs: number;
  durCount: number;
}

function row(partial: Partial<AggRow>): AggRow {
  return {
    bucketStart: null,
    groupKey: null,
    runs: 0,
    succeeded: 0,
    failed: 0,
    durSumMs: 0,
    durCount: 0,
    ...partial,
  };
}

beforeEach(() => {
  mockAggregateRuns.mockReset();
  mockListByIdsForAccount.mockReset();
  mockAggregateRuns.mockResolvedValue([]);
  mockListByIdsForAccount.mockResolvedValue([]);
});

// ── Pure time helpers ────────────────────────────────────────────────────────

describe("resolveQueryRange", () => {
  it("presets mirror the overview's rolling semantics", () => {
    expect(resolveQueryRange({ preset: "7d" }, NOW)).toEqual({
      fromMs: NOW - 7 * DAY,
      toMs: NOW,
    });
    expect(resolveQueryRange({ preset: "today" }, NOW)).toEqual({
      fromMs: Date.parse("2026-07-15T00:00:00.000Z"),
      toMs: NOW,
    });
    expect(resolveQueryRange({ preset: "ytd" }, NOW)).toEqual({
      fromMs: Date.parse("2026-01-01T00:00:00.000Z"),
      toMs: NOW,
    });
  });
  it("custom ranges parse verbatim", () => {
    expect(
      resolveQueryRange(
        { from: "2026-06-01T00:00:00.000Z", to: "2026-06-08T00:00:00.000Z" },
        NOW,
      ),
    ).toEqual({
      fromMs: Date.parse("2026-06-01T00:00:00.000Z"),
      toMs: Date.parse("2026-06-08T00:00:00.000Z"),
    });
  });
});

describe("resolveTimeGrain — auto thresholds", () => {
  it("≤92d → day, ≤731d → week, beyond → month; explicit wins", () => {
    expect(resolveTimeGrain("auto", 92 * DAY)).toBe("day");
    expect(resolveTimeGrain("auto", 93 * DAY)).toBe("week");
    expect(resolveTimeGrain("auto", 731 * DAY)).toBe("week");
    expect(resolveTimeGrain("auto", 732 * DAY)).toBe("month");
    expect(resolveTimeGrain("month", 7 * DAY)).toBe("month");
  });
});

describe("bucketStartsFor — calendar buckets over [from, to)", () => {
  it("day buckets are contiguous UTC days; `to` is exclusive", () => {
    const from = Date.parse("2026-07-01T06:00:00.000Z");
    const to = Date.parse("2026-07-04T00:00:00.000Z"); // exact bucket boundary
    const starts = bucketStartsFor("day", from, to);
    expect(starts).toEqual([
      Date.parse("2026-07-01T00:00:00.000Z"),
      Date.parse("2026-07-02T00:00:00.000Z"),
      Date.parse("2026-07-03T00:00:00.000Z"),
      // 07-04 excluded — [from, to)
    ]);
  });
  it("week buckets start on the ISO Monday (like date_trunc('week'))", () => {
    // 2026-07-15 is a Wednesday; its ISO week starts Monday 2026-07-13.
    const starts = bucketStartsFor(
      "week",
      Date.parse("2026-07-15T00:00:00.000Z"),
      Date.parse("2026-07-16T00:00:00.000Z"),
    );
    expect(starts).toEqual([Date.parse("2026-07-13T00:00:00.000Z")]);
  });
  it("month buckets step calendar months", () => {
    const starts = bucketStartsFor(
      "month",
      Date.parse("2026-01-15T00:00:00.000Z"),
      Date.parse("2026-04-01T00:00:00.000Z"),
    );
    expect(starts).toEqual([
      Date.parse("2026-01-01T00:00:00.000Z"),
      Date.parse("2026-02-01T00:00:00.000Z"),
      Date.parse("2026-03-01T00:00:00.000Z"),
    ]);
  });
});

// ── KPI ──────────────────────────────────────────────────────────────────────

describe("runAnalyticsQuery — KPI", () => {
  it("queries the exact [from, to) window and derives the value", async () => {
    mockAggregateRuns.mockResolvedValueOnce([
      row({ runs: 10, succeeded: 7, failed: 3 }),
    ]);
    const result = await runAnalyticsQuery(
      ACCOUNT,
      q({ measure: "success_rate", dimension: null, range: { preset: "7d" } }),
      { now: NOW },
    );
    expect(result.kind).toBe("kpi");
    expect(result.value).toBeCloseTo(0.7, 10);
    expect(mockAggregateRuns).toHaveBeenCalledTimes(1);
    const params = mockAggregateRuns.mock.calls[0]![0];
    expect(params).toMatchObject({
      accountId: ACCOUNT,
      dimension: null,
      grain: null,
      seriesBy: null,
      includeTests: false,
      limit: null,
    });
    expect(params.from).toBe(new Date(NOW - 7 * DAY).toISOString());
    expect(params.to).toBe(new Date(NOW).toISOString());
  });

  it("zero terminal runs → success_rate null, runs 0 (canonical rule)", async () => {
    mockAggregateRuns.mockResolvedValue([]);
    const rate = await runAnalyticsQuery(
      ACCOUNT,
      q({ measure: "success_rate", dimension: null, range: { preset: "7d" } }),
      { now: NOW },
    );
    expect(rate.value).toBeNull();
    const runs = await runAnalyticsQuery(
      ACCOUNT,
      q({ measure: "runs", dimension: null, range: { preset: "7d" } }),
      { now: NOW },
    );
    expect(runs.value).toBe(0);
  });

  it("previous-period compare uses the adjacent, non-overlapping window", async () => {
    mockAggregateRuns
      .mockResolvedValueOnce([row({ runs: 10 })])
      .mockResolvedValueOnce([row({ runs: 4 })]);
    const result = await runAnalyticsQuery(
      ACCOUNT,
      q({
        measure: "runs",
        dimension: null,
        range: { preset: "7d" },
        compare: "previous_period",
      }),
      { now: NOW },
    );
    expect(result.value).toBe(10);
    expect(result.compare?.previousValue).toBe(4);
    const main = mockAggregateRuns.mock.calls[0]![0];
    const prev = mockAggregateRuns.mock.calls[1]![0];
    // Equal length, and prev.to === main.from (no overlap, no gap).
    expect(prev.to).toBe(main.from);
    expect(Date.parse(prev.to) - Date.parse(prev.from)).toBe(
      Date.parse(main.to) - Date.parse(main.from),
    );
  });

  it("passes includeTests through when explicitly enabled", async () => {
    await runAnalyticsQuery(
      ACCOUNT,
      q({
        measure: "runs",
        dimension: null,
        range: { preset: "7d" },
        filters: { includeTests: true },
      }),
      { now: NOW },
    );
    expect(mockAggregateRuns.mock.calls[0]![0].includeTests).toBe(true);
  });
});

// ── Workflow-ownership validation ────────────────────────────────────────────

describe("runAnalyticsQuery — workflow-id validation", () => {
  it("nonexistent and cross-account ids throw the SAME non-leaking error", async () => {
    // The repo returns fewer refs than requested in BOTH cases (RLS/account
    // predicate make foreign ids indistinguishable from missing ones).
    mockListByIdsForAccount.mockResolvedValue([
      { id: WF_A, name: "Mine", state: "active" },
    ]);
    const query = q({
      measure: "runs",
      dimension: null,
      range: { preset: "7d" },
      filters: { workflowIds: [WF_A, WF_B] },
    });
    await expect(runAnalyticsQuery(ACCOUNT, query, { now: NOW })).rejects.toThrow(
      UNKNOWN_WORKFLOW_MESSAGE,
    );
    await expect(runAnalyticsQuery(ACCOUNT, query, { now: NOW })).rejects.toMatchObject(
      { code: "UNKNOWN_WORKFLOW" },
    );
    // Nothing reached the aggregation layer.
    expect(mockAggregateRuns).not.toHaveBeenCalled();
  });

  it("valid ids are passed to the aggregate as the filter", async () => {
    mockListByIdsForAccount.mockResolvedValue([
      { id: WF_A, name: "A", state: "active" },
      { id: WF_B, name: "B", state: "paused" },
    ]);
    await runAnalyticsQuery(
      ACCOUNT,
      q({
        measure: "runs",
        dimension: null,
        range: { preset: "7d" },
        filters: { workflowIds: [WF_A, WF_B] },
      }),
      { now: NOW },
    );
    expect(mockListByIdsForAccount).toHaveBeenCalledWith(ACCOUNT, [WF_A, WF_B]);
    expect(mockAggregateRuns.mock.calls[0]![0].workflowIds).toEqual([WF_A, WF_B]);
  });

  it("invalid capability combinations throw INVALID_QUERY without any I/O", async () => {
    await expect(
      runAnalyticsQuery(
        ACCOUNT,
        q({ measure: "success_rate", dimension: "status", range: { preset: "7d" } }),
        { now: NOW },
      ),
    ).rejects.toMatchObject({ code: "INVALID_QUERY" });
    expect(mockAggregateRuns).not.toHaveBeenCalled();
    expect(mockListByIdsForAccount).not.toHaveBeenCalled();
  });
});

// ── Time series ──────────────────────────────────────────────────────────────

describe("runAnalyticsQuery — time series", () => {
  const from = "2026-07-01T00:00:00.000Z";
  const to = "2026-07-04T00:00:00.000Z";

  it("single series: contiguous buckets, zero-filled counts", async () => {
    mockAggregateRuns.mockResolvedValueOnce([
      row({ bucketStart: "2026-07-02T00:00:00.000Z", runs: 3, succeeded: 2, failed: 1 }),
    ]);
    const result = await runAnalyticsQuery(
      ACCOUNT,
      q({ measure: "runs", dimension: "time", timeGrain: "day", range: { from, to } }),
      { now: NOW },
    );
    expect(result.kind).toBe("time_series");
    expect(result.grain).toBe("day");
    expect(result.buckets?.map((b) => b.label)).toEqual([
      "2026-07-01",
      "2026-07-02",
      "2026-07-03",
    ]);
    expect(result.buckets?.[0]).toEqual({
      start: "2026-07-01T00:00:00.000Z",
      end: "2026-07-02T00:00:00.000Z",
      label: "2026-07-01",
    });
    expect(result.series).toHaveLength(1);
    expect(result.series?.[0]?.values).toEqual([0, 3, 0]); // zero-fill
  });

  it("avg_duration series null-fills empty buckets (0ms would be a lie)", async () => {
    mockAggregateRuns.mockResolvedValueOnce([
      row({
        bucketStart: "2026-07-01T00:00:00.000Z",
        runs: 2,
        succeeded: 2,
        durSumMs: 3000,
        durCount: 2,
      }),
    ]);
    const result = await runAnalyticsQuery(
      ACCOUNT,
      q({
        measure: "avg_duration_ms",
        dimension: "time",
        timeGrain: "day",
        range: { from, to },
      }),
      { now: NOW },
    );
    expect(result.series?.[0]?.values).toEqual([1500, null, null]);
  });

  it("explicit workflow series: exact ids become exact series, order preserved, stray rows ignored", async () => {
    mockListByIdsForAccount.mockResolvedValue([
      { id: WF_A, name: "Invoices", state: "active" },
      { id: WF_B, name: "Old sync", state: "deleted" },
    ]);
    mockAggregateRuns.mockResolvedValueOnce([
      row({ bucketStart: from, groupKey: WF_B, runs: 5, succeeded: 5 }),
      row({ bucketStart: from, groupKey: WF_A, runs: 2, succeeded: 2 }),
      // A row for an UNSELECTED workflow must never become a series.
      row({ bucketStart: from, groupKey: WF_C, runs: 99, succeeded: 99 }),
    ]);
    const result = await runAnalyticsQuery(
      ACCOUNT,
      q({
        measure: "runs",
        dimension: "time",
        timeGrain: "day",
        range: { from, to },
        series: { by: "workflow", mode: "explicit", ids: [WF_A, WF_B] },
      }),
      { now: NOW },
    );
    // The aggregate was scoped to exactly the selected ids.
    expect(mockAggregateRuns.mock.calls[0]![0]).toMatchObject({
      seriesBy: "workflow",
      workflowIds: [WF_A, WF_B],
    });
    expect(result.series?.map((s) => s.meta)).toEqual([
      { id: WF_A, label: "Invoices", workflowState: "active" },
      { id: WF_B, label: "Old sync (deleted)", workflowState: "deleted" },
    ]);
    expect(result.series?.[0]?.values).toEqual([2, 0, 0]);
    expect(result.series?.[1]?.values).toEqual([5, 0, 0]);
  });

  it("status series render one line per terminal status", async () => {
    mockAggregateRuns.mockResolvedValueOnce([
      row({ bucketStart: from, groupKey: "succeeded", runs: 4, succeeded: 4 }),
      row({ bucketStart: from, groupKey: "failed", runs: 1, failed: 1 }),
    ]);
    const result = await runAnalyticsQuery(
      ACCOUNT,
      q({
        measure: "runs",
        dimension: "time",
        timeGrain: "day",
        range: { from, to },
        series: { by: "status" },
      }),
      { now: NOW },
    );
    expect(result.series?.map((s) => s.meta.label)).toEqual([
      "Succeeded",
      "Failed",
    ]);
    expect(result.series?.[0]?.values).toEqual([4, 0, 0]);
    expect(result.series?.[1]?.values).toEqual([1, 0, 0]);
  });

  it("Top-N series resolve ids first (bounded), then aggregate only those", async () => {
    mockAggregateRuns
      // 1st call — categorical top-N discovery.
      .mockResolvedValueOnce([
        row({ groupKey: WF_B, runs: 9 }),
        row({ groupKey: WF_A, runs: 3 }),
      ])
      // 2nd call — the bucketed series query.
      .mockResolvedValueOnce([
        row({ bucketStart: from, groupKey: WF_B, runs: 9, succeeded: 9 }),
      ]);
    mockListByIdsForAccount.mockResolvedValue([
      { id: WF_A, name: "A", state: "active" },
      { id: WF_B, name: "B", state: "active" },
    ]);
    const result = await runAnalyticsQuery(
      ACCOUNT,
      q({
        measure: "runs",
        dimension: "time",
        timeGrain: "day",
        range: { from, to },
        series: { by: "workflow", mode: "top", topN: 2 },
      }),
      { now: NOW },
    );
    const discovery = mockAggregateRuns.mock.calls[0]![0];
    expect(discovery).toMatchObject({ dimension: "workflow", limit: 2, seriesBy: null });
    const main = mockAggregateRuns.mock.calls[1]![0];
    expect(main).toMatchObject({ seriesBy: "workflow", workflowIds: [WF_B, WF_A] });
    expect(result.series?.map((s) => s.meta.id)).toEqual([WF_B, WF_A]);
  });

  it("single-series compare returns index-aligned previous values", async () => {
    mockAggregateRuns
      .mockResolvedValueOnce([
        row({ bucketStart: "2026-07-02T00:00:00.000Z", runs: 3, succeeded: 3 }),
      ])
      .mockResolvedValueOnce([
        row({ bucketStart: "2026-06-29T00:00:00.000Z", runs: 7, succeeded: 7 }),
      ]);
    const result = await runAnalyticsQuery(
      ACCOUNT,
      q({
        measure: "runs",
        dimension: "time",
        timeGrain: "day",
        range: { from, to },
        compare: "previous_period",
      }),
      { now: NOW },
    );
    expect(result.compareSeries?.previousRange).toEqual({
      from: "2026-06-28T00:00:00.000Z",
      to: "2026-07-01T00:00:00.000Z",
    });
    // Previous window buckets: 06-28, 06-29, 06-30 → values aligned by index.
    expect(result.compareSeries?.values).toEqual([0, 7, 0]);
    expect(result.series?.[0]?.values).toEqual([0, 3, 0]);
  });
});

// ── Categorical ──────────────────────────────────────────────────────────────

describe("runAnalyticsQuery — categorical", () => {
  it("caps rows via limit+1, flags truncation, labels workflows (deleted/unknown)", async () => {
    mockAggregateRuns.mockResolvedValueOnce([
      row({ groupKey: WF_A, runs: 9, succeeded: 9 }),
      row({ groupKey: WF_B, runs: 5, succeeded: 4, failed: 1 }),
      row({ groupKey: WF_C, runs: 1, succeeded: 1 }), // the +1 overflow row
    ]);
    mockListByIdsForAccount.mockResolvedValue([
      { id: WF_A, name: "Invoices", state: "active" },
      { id: WF_B, name: "Old sync", state: "deleted" },
    ]);
    const result = await runAnalyticsQuery(
      ACCOUNT,
      q({
        measure: "runs",
        dimension: "workflow",
        range: { preset: "30d" },
        limit: 2,
      }),
      { now: NOW },
    );
    expect(mockAggregateRuns.mock.calls[0]![0].limit).toBe(3); // limit + 1
    expect(result.truncated).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.rows).toEqual([
      { id: WF_A, label: "Invoices", workflowState: "active", value: 9, runs: 9 },
      {
        id: WF_B,
        label: "Old sync (deleted)",
        workflowState: "deleted",
        value: 5,
        runs: 5,
      },
    ]);
  });

  it("unknown workflow rows label as Untitled workflow", async () => {
    mockAggregateRuns.mockResolvedValueOnce([row({ groupKey: WF_C, runs: 2 })]);
    mockListByIdsForAccount.mockResolvedValue([]);
    const result = await runAnalyticsQuery(
      ACCOUNT,
      q({ measure: "runs", dimension: "workflow", range: { preset: "30d" } }),
      { now: NOW },
    );
    expect(result.rows?.[0]?.label).toBe("Untitled workflow");
    expect(result.truncated).toBe(false);
  });

  it("sorts by label when asked; null measure values sort last", async () => {
    mockAggregateRuns.mockResolvedValueOnce([
      row({ groupKey: "webhook", runs: 5, succeeded: 5, durSumMs: 0, durCount: 0 }),
      row({ groupKey: "manual", runs: 2, succeeded: 2, durSumMs: 100, durCount: 2 }),
    ]);
    const byLabel = await runAnalyticsQuery(
      ACCOUNT,
      q({
        measure: "runs",
        dimension: "trigger_source",
        range: { preset: "30d" },
        sort: { by: "label", dir: "asc" },
      }),
      { now: NOW },
    );
    expect(byLabel.rows?.map((r) => r.label)).toEqual(["Manual", "Webhook"]);

    mockAggregateRuns.mockResolvedValueOnce([
      row({ groupKey: "webhook", runs: 5, succeeded: 5, durSumMs: 0, durCount: 0 }),
      row({ groupKey: "manual", runs: 2, succeeded: 2, durSumMs: 100, durCount: 2 }),
    ]);
    const byValue = await runAnalyticsQuery(
      ACCOUNT,
      q({
        measure: "avg_duration_ms",
        dimension: "trigger_source",
        range: { preset: "30d" },
        sort: { by: "value", dir: "asc" },
      }),
      { now: NOW },
    );
    // webhook has no finished runs → null → last, even ascending.
    expect(byValue.rows?.map((r) => r.id)).toEqual(["manual", "webhook"]);
    expect(byValue.rows?.[1]?.value).toBeNull();
  });
});
