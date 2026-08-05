/**
 * @jest-environment node
 *
 * SUPABASE-TABLE-TYPING-1C — the analytics aggregate boundary.
 *
 * `analytics_runs_aggregate` returns `count(*)`/`sum(...)` columns, which are
 * bigint/numeric in Postgres and which PostgREST may serialize as JSON strings.
 * The repository used to map them with `Number(...)`, so a NULL or a
 * non-numeric cell became `NaN` and travelled — silently — into every chart,
 * total and average built on top. These tests pin the fail-closed contract, and
 * the honest nullability of the two dimension columns the generated
 * `RETURNS TABLE` type calls non-null.
 */

interface RpcState {
  data: unknown;
  error: { message: string } | null;
}
const state: RpcState = { data: null, error: null };
const mockRpc = jest.fn(async () => ({ data: state.data, error: state.error }));

jest.mock("@/repositories/supabase/serviceRoleClient", () => ({
  getServiceRoleClient: jest.fn(() => ({ rpc: mockRpc })),
}));

import { aggregateRuns, type AnalyticsAggregateParams } from "@/repositories/analytics/queries";

const params: AnalyticsAggregateParams = {
  accountId: "acct-1",
  from: "2026-05-01T00:00:00Z",
  to: "2026-06-01T00:00:00Z",
  dimension: null,
  grain: null,
  seriesBy: null,
  workflowIds: null,
  statuses: null,
  triggerSources: null,
  includeTests: false,
  limit: null,
};

function rpcRow(over: Record<string, unknown> = {}) {
  return {
    bucket_start: "2026-05-01T00:00:00Z",
    group_key: "wf-1",
    runs: 10,
    succeeded: 7,
    failed: 3,
    dur_sum_ms: 1500,
    dur_count: 10,
    ...over,
  };
}

beforeEach(() => {
  mockRpc.mockClear();
  state.data = null;
  state.error = null;
});

describe("aggregateRuns — argument wiring", () => {
  it("passes the window, dimension and filters through to the RPC", async () => {
    state.data = [];
    await aggregateRuns({
      ...params,
      dimension: "time",
      grain: "day",
      seriesBy: "workflow",
      workflowIds: ["wf-1", "wf-2"],
      statuses: ["succeeded"],
      triggerSources: ["manual"],
      includeTests: true,
      limit: 26,
    });
    expect(mockRpc).toHaveBeenCalledWith("analytics_runs_aggregate", {
      p_account_id: "acct-1",
      p_from: "2026-05-01T00:00:00Z",
      p_to: "2026-06-01T00:00:00Z",
      p_dimension: "time",
      p_grain: "day",
      p_series_by: "workflow",
      p_workflow_ids: ["wf-1", "wf-2"],
      p_statuses: ["succeeded"],
      p_trigger_sources: ["manual"],
      p_include_tests: true,
      p_limit: 26,
    });
  });

  it("null data → [] and an RPC error throws", async () => {
    state.data = null;
    expect(await aggregateRuns(params)).toEqual([]);
    state.error = { message: "boom" };
    await expect(aggregateRuns(params)).rejects.toThrow(
      /analytics_runs_aggregate failed: boom/,
    );
  });
});

describe("aggregateRuns — row mapping", () => {
  it("maps snake_case aggregates to the domain row", async () => {
    state.data = [rpcRow()];
    const [row] = await aggregateRuns(params);
    expect(row).toEqual({
      bucketStart: "2026-05-01T00:00:00Z",
      groupKey: "wf-1",
      runs: 10,
      succeeded: 7,
      failed: 3,
      durSumMs: 1500,
      durCount: 10,
    });
  });

  it("preserves the genuine NULLs of a KPI row", async () => {
    // The generated RETURNS TABLE type calls both columns non-null; a
    // dimension-less KPI query really does return NULL for them.
    state.data = [rpcRow({ bucket_start: null, group_key: null })];
    const [row] = await aggregateRuns(params);
    expect(row!.bucketStart).toBeNull();
    expect(row!.groupKey).toBeNull();
    expect(row!.runs).toBe(10);
  });

  it("accepts the numeric STRINGS PostgREST may return for bigint/numeric", async () => {
    state.data = [rpcRow({ runs: "10", succeeded: "7", failed: "3", dur_sum_ms: "1500", dur_count: "10" })];
    const [row] = await aggregateRuns(params);
    expect(row).toMatchObject({ runs: 10, succeeded: 7, failed: 3, durSumMs: 1500, durCount: 10 });
  });

  it("keeps a legitimate zero aggregate", async () => {
    state.data = [rpcRow({ runs: 0, succeeded: 0, failed: 0, dur_sum_ms: 0, dur_count: 0 })];
    const [row] = await aggregateRuns(params);
    expect(row).toMatchObject({ runs: 0, durSumMs: 0, durCount: 0 });
  });
});

describe("aggregateRuns — malformed aggregates fail closed", () => {
  it.each([
    ["runs", "analytics_runs_aggregate.runs"],
    ["succeeded", "analytics_runs_aggregate.succeeded"],
    ["failed", "analytics_runs_aggregate.failed"],
    ["dur_sum_ms", "analytics_runs_aggregate.dur_sum_ms"],
    ["dur_count", "analytics_runs_aggregate.dur_count"],
  ])("rejects a NULL %s instead of reporting it as zero", async (column, label) => {
    state.data = [rpcRow({ [column]: null })];
    await expect(aggregateRuns(params)).rejects.toThrow(
      new RegExp(`${label.replace(/\./g, "\\.")}: expected a finite numeric aggregate`),
    );
  });

  it("rejects a non-numeric aggregate instead of yielding NaN", async () => {
    state.data = [rpcRow({ runs: "not-a-number" })];
    await expect(aggregateRuns(params)).rejects.toThrow(/expected a finite numeric aggregate/);
  });

  it("rejects one malformed row even when other rows are fine", async () => {
    state.data = [rpcRow(), rpcRow({ group_key: "wf-2", dur_sum_ms: undefined })];
    await expect(aggregateRuns(params)).rejects.toThrow(
      /analytics_runs_aggregate\.dur_sum_ms: expected a finite numeric aggregate/,
    );
  });

  it("does not echo the offending cell into the error message", async () => {
    state.data = [rpcRow({ runs: "leaky-looking-value" })];
    await expect(aggregateRuns(params)).rejects.toThrow(
      expect.objectContaining({
        message: expect.not.stringContaining("leaky-looking-value") as unknown as string,
      }),
    );
  });
});
