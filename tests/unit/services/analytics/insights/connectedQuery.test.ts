/** @jest-environment node */
/**
 * ANALYTICS-CONNECTED-DATA-CD-1 — connected query validation + ChainReact
 * adapter PARITY with the CS-1 engine. Repos are mocked at the module
 * boundary (same seam as the CS-1 suite); both paths run against identical
 * mocks and must return semantically equivalent values.
 */
import { ConnectedAnalyticsQuerySchema } from "@/contracts/connectedAnalytics";

const mockAggregateRuns = jest.fn();
jest.mock("@/repositories/analytics/queries", () => ({
  aggregateRuns: (...args: unknown[]) => mockAggregateRuns(...args),
}));
const mockListByIdsForAccount = jest.fn();
jest.mock("@/repositories/workflows", () => ({
  listByIdsForAccount: (...args: unknown[]) => mockListByIdsForAccount(...args),
}));

import { AnalyticsQuerySchema } from "@/contracts/analyticsQuery";
import { runAnalyticsQuery, UNKNOWN_WORKFLOW_MESSAGE } from "@/services/analytics/insightQuery";
import { runConnectedAnalyticsQuery } from "@/services/analytics/insights/runConnectedQuery";

const CTX = { accountId: "acct-1", userId: "u1", now: Date.parse("2026-07-15T12:00:00.000Z") };
const WF_A = "11111111-1111-4111-8111-111111111111";
const WF_B = "22222222-2222-4222-8222-222222222222";

function q(body: Record<string, unknown>) {
  return ConnectedAnalyticsQuerySchema.parse({
    source: "chainreact",
    dataset: "workflow_runs",
    ...body,
  });
}
const row = (p: Record<string, unknown>) => ({
  bucketStart: null, groupKey: null, runs: 0, succeeded: 0, failed: 0, durSumMs: 0, durCount: 0, ...p,
});

beforeEach(() => {
  mockAggregateRuns.mockReset().mockResolvedValue([]);
  mockListByIdsForAccount.mockReset().mockResolvedValue([]);
});

describe("orchestrator — unknown source/dataset (no registry leak)", () => {
  it("unknown source / dataset → generic typed errors", async () => {
    await expect(
      runConnectedAnalyticsQuery(CTX, q({ source: "powerbi", measure: "runs", dimension: null, range: { preset: "7d" } })),
    ).rejects.toMatchObject({ code: "UNKNOWN_SOURCE", message: "That data source isn't available." });
    await expect(
      runConnectedAnalyticsQuery(CTX, q({ dataset: "secrets", measure: "runs", dimension: null, range: { preset: "7d" } })),
    ).rejects.toMatchObject({ code: "UNKNOWN_DATASET", message: "That data isn't available." });
    expect(mockAggregateRuns).not.toHaveBeenCalled();
  });
});

describe("capability validation (typed, no silent rewrite, no I/O)", () => {
  const cases: [string, Record<string, unknown>][] = [
    ["unknown measure", { measure: "tasks_used", dimension: null, range: { preset: "7d" } }],
    ["unknown dimension", { measure: "runs", dimension: "vehicle", range: { preset: "7d" } }],
    ["measure×dimension invalid (success_rate by status)", { measure: "success_rate", dimension: "status", range: { preset: "7d" } }],
    ["unknown filter", { measure: "runs", dimension: null, filters: { channel: ["c1"] }, range: { preset: "7d" } }],
    ["wrong filter value type", { measure: "runs", dimension: null, filters: { include_tests: ["yes"] }, range: { preset: "7d" } }],
    ["incompatible status filter", { measure: "success_rate", dimension: null, filters: { status: ["failed"] }, range: { preset: "7d" } }],
    ["grain off time", { measure: "runs", dimension: "workflow", timeGrain: "week", range: { preset: "7d" } }],
    ["series off time", { measure: "runs", dimension: null, series: { by: "workflow", mode: "top" }, range: { preset: "7d" } }],
    ["series dim not supported by measure", { measure: "success_rate", dimension: "time", series: { by: "status" }, range: { preset: "7d" } }],
    ["status series with explicit mode", { measure: "runs", dimension: "time", series: { by: "status", mode: "explicit", ids: ["succeeded"] }, range: { preset: "7d" } }],
    ["invalid date field", { measure: "runs", dimension: "time", dateField: "finished", range: { preset: "7d" } }],
    // Donut IS supported on `status` (a declared part-to-whole, CD-3B) — but
    // never on a dimension whose Top-N rows omit an unlabeled remainder.
    ["donut on a non part-to-whole dimension", { measure: "runs", dimension: "workflow", chart: "donut", range: { preset: "7d" } }],
    ["donut without a grouping", { measure: "runs", dimension: null, chart: "donut", range: { preset: "7d" } }],
    ["line without time", { measure: "runs", dimension: "workflow", chart: "line", range: { preset: "7d" } }],
    ["compare on multi-series", { measure: "runs", dimension: "time", series: { by: "status" }, compare: "previous_period", range: { preset: "7d" } }],
    ["range too long", { measure: "runs", dimension: null, range: { from: "2025-01-01T00:00:00Z", to: "2026-06-01T00:00:00Z" } }],
  ];
  for (const [name, body] of cases) {
    it(name, async () => {
      await expect(runConnectedAnalyticsQuery(CTX, q(body))).rejects.toMatchObject({
        code: "INVALID_QUERY",
      });
      expect(mockAggregateRuns).not.toHaveBeenCalled();
    });
  }
  it("schema rejects unknown keys and any account id", () => {
    expect(
      ConnectedAnalyticsQuerySchema.safeParse({
        source: "chainreact", dataset: "workflow_runs", measure: "runs",
        dimension: null, range: { preset: "7d" }, accountId: "acct-2",
      }).success,
    ).toBe(false);
  });
});

describe("ChainReact adapter parity with direct CS-1", () => {
  async function both(connectedBody: Record<string, unknown>, csBody: Record<string, unknown>) {
    const connected = await runConnectedAnalyticsQuery(CTX, q(connectedBody));
    // Re-arm identical mock behavior for the direct call.
    mockAggregateRuns.mockClear();
    for (const impl of queued) mockAggregateRuns.mockResolvedValueOnce(impl);
    const direct = await runAnalyticsQuery(
      CTX.accountId,
      AnalyticsQuerySchema.parse(csBody),
      { now: CTX.now },
    );
    return { connected, direct };
  }
  let queued: unknown[][] = [];
  function arm(...responses: unknown[][]) {
    queued = responses;
    mockAggregateRuns.mockReset();
    for (const r of responses) mockAggregateRuns.mockResolvedValueOnce(r);
    mockListByIdsForAccount.mockResolvedValue([
      { id: WF_A, name: "Invoices", state: "active" },
      { id: WF_B, name: "Old sync", state: "deleted" },
    ]);
  }

  it("KPI success_rate: identical value + null-vs-zero + compare windows", async () => {
    arm([row({ runs: 10, succeeded: 7, failed: 3 })], [row({ runs: 4, succeeded: 2, failed: 2 })]);
    const { connected, direct } = await both(
      { measure: "success_rate", dimension: null, compare: "previous_period", range: { preset: "7d" } },
      { measure: "success_rate", dimension: null, compare: "previous_period", range: { preset: "7d" } },
    );
    expect(connected.value).toBe(direct.value);
    expect(connected.compare).toEqual(direct.compare);
    expect(connected.valueMeta).toEqual({ unit: "percent" });
    expect(connected.freshness).toEqual({ mode: "live" });
    expect(connected.completeness).toEqual({ state: "complete" });
    arm([]);
    const empty = await runConnectedAnalyticsQuery(
      CTX, q({ measure: "success_rate", dimension: null, range: { preset: "7d" } }),
    );
    expect(empty.value).toBeNull(); // canonical zero-run rule preserved
  });

  it("explicit workflow series: identical buckets/values/labels incl. deleted + test filter", async () => {
    const from = "2026-07-01T00:00:00.000Z";
    const seriesRows = [
      row({ bucketStart: from, groupKey: WF_A, runs: 2, succeeded: 2 }),
      row({ bucketStart: from, groupKey: WF_B, runs: 5, succeeded: 4, failed: 1 }),
    ];
    arm(seriesRows);
    const body = {
      measure: "runs", dimension: "time", timeGrain: "day",
      range: { from, to: "2026-07-03T00:00:00.000Z" },
      series: { by: "workflow", mode: "explicit", ids: [WF_A, WF_B] },
      filters: { include_tests: true },
    };
    const { connected, direct } = await both(body, {
      measure: "runs", dimension: "time", timeGrain: "day",
      range: body.range, series: body.series, filters: { includeTests: true },
    });
    expect(connected.buckets).toEqual(direct.buckets);
    expect(connected.series!.map((s) => ({ id: s.id, label: s.label, state: s.entityState, values: s.values })))
      .toEqual(direct.series!.map((s) => ({ id: s.meta.id, label: s.meta.label, state: s.meta.workflowState, values: s.values })));
    expect(connected.series![1]!.label).toBe("Old sync (deleted)");
    // includeTests translated through to the repo call on BOTH paths.
    expect(mockAggregateRuns.mock.calls[0]![0]).toMatchObject({ includeTests: true, workflowIds: [WF_A, WF_B] });
  });

  it("categorical trigger_source: identical rows/orders + truncation → structured completeness", async () => {
    const rows = [
      row({ groupKey: "webhook", runs: 5, succeeded: 5 }),
      row({ groupKey: "manual", runs: 2, succeeded: 2 }),
      row({ groupKey: "scheduled", runs: 1, succeeded: 1 }),
    ];
    arm(rows);
    const body = { measure: "runs", dimension: "trigger_source", limit: 2, range: { preset: "30d" } };
    const { connected, direct } = await both(body, body);
    expect(connected.rows!.map((r) => ({ id: r.id, label: r.label, value: r.value })))
      .toEqual(direct.rows!.map((r) => ({ id: r.id, label: r.label, value: r.value })));
    expect(direct.truncated).toBe(true);
    expect(connected.completeness.state).toBe("row_capped");
    expect(connected.warnings).toEqual(direct.warnings);
  });

  it("non-leaking unknown-workflow behavior preserved (UNKNOWN_ENTITY)", async () => {
    mockListByIdsForAccount.mockResolvedValue([{ id: WF_A, name: "Mine", state: "active" }]);
    await expect(
      runConnectedAnalyticsQuery(CTX, q({
        measure: "runs", dimension: null,
        filters: { workflow: [WF_A, WF_B] }, range: { preset: "7d" },
      })),
    ).rejects.toMatchObject({ code: "UNKNOWN_ENTITY", message: UNKNOWN_WORKFLOW_MESSAGE });
    expect(mockAggregateRuns).not.toHaveBeenCalled();
  });

  it("adapter result carries source attribution and never raw run payload keys", async () => {
    arm([row({ runs: 3, succeeded: 3 })]);
    const r = await runConnectedAnalyticsQuery(
      CTX, q({ measure: "runs", dimension: null, range: { preset: "7d" } }),
    );
    expect(r.source).toEqual({
      sourceId: "chainreact", sourceLabel: "ChainReact",
      datasetId: "workflow_runs", datasetLabel: "Workflow runs",
    });
    const json = JSON.stringify(r);
    for (const banned of ["trigger_event", "steps", "fatal_error", "draft_definition", "output"]) {
      expect(json).not.toContain(banned);
    }
  });
});
