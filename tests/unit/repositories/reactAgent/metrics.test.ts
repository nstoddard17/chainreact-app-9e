/**
 * @jest-environment node
 *
 * Tests for repositories/reactAgentMetrics.ts (INTERNAL-FEEDBACK-2).
 *
 * Business rule: cross-account aggregation of React Agent telemetry into
 * count-only numbers, via the service-role client, WITHOUT ever reading a content
 * column. Proves: correct status/outcome counts, setup-issue rollup (sum +
 * distinct workflows), date-range propagation, empty → zeros, and the structural
 * no-leak guarantee (only `setup_issue_count, workflow_id` is ever selected as
 * rows; everything else is a head:true count that transfers no rows).
 */

const getServiceRoleClientMock = jest.fn();
jest.mock("@/repositories/supabase/serviceRoleClient", () => ({
  getServiceRoleClient: (...a: unknown[]) => getServiceRoleClientMock(...a),
}));

import { aggregateReactAgentMetrics } from "@/repositories/reactAgent/metrics";

interface BuilderState {
  table: string;
  selectArg: string;
  head: boolean;
  scope: [string, string] | null;
  gte: [string, string] | null;
  lte: [string, string] | null;
}

// Test-configured results, keyed by a query signature.
let counts: Record<string, number>;
let setupRows: Array<Record<string, unknown>>;
let built: BuilderState[];

function resolverFor(state: BuilderState): unknown {
  if (state.head) {
    const key = state.scope
      ? `${state.table}:${state.scope[1]}`
      : `${state.table}:*`;
    return { count: counts[key] ?? 0, error: null };
  }
  // Non-head row select = the setup rollup.
  return { data: setupRows, error: null };
}

function makeBuilder(table: string, selectArg: string, opts?: { head?: boolean }) {
  const state: BuilderState = {
    table,
    selectArg,
    head: Boolean(opts?.head),
    scope: null,
    gte: null,
    lte: null,
  };
  built.push(state);
  const b: Record<string, unknown> = {
    gte: (c: string, v: string) => { state.gte = [c, v]; return b; },
    lte: (c: string, v: string) => { state.lte = [c, v]; return b; },
    eq: (c: string, v: string) => { state.scope = [c, v]; return b; },
    gt: (_c: string, _v: number) => b,
    then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve(resolverFor(state)).then(res, rej),
  };
  return b;
}

const client = {
  from: (table: string) => ({
    select: (selectArg: string, opts?: { head?: boolean }) =>
      makeBuilder(table, selectArg, opts),
  }),
};

beforeEach(() => {
  counts = {};
  setupRows = [];
  built = [];
  getServiceRoleClientMock.mockReset().mockReturnValue(client);
});

describe("aggregateReactAgentMetrics", () => {
  it("maps status + outcome counts and the setup rollup into the aggregate", async () => {
    counts = {
      "agent_change_history:*": 100,
      "agent_change_history:preview_created": 40,
      "agent_change_history:preview_applied": 25,
      "agent_change_history:kept_as_preview": 5,
      "agent_change_history:preview_discarded": 8,
      "agent_change_history:apply_failed": 3,
      "agent_change_history:undone": 2,
      "agent_change_history:tested": 10,
      "agent_change_history:test_failed": 4,
      "react_agent_audit_events:*": 50,
      "react_agent_audit_events:success": 45,
      "react_agent_audit_events:denied": 3,
      "react_agent_audit_events:failed": 2,
    };
    setupRows = [
      { setup_issue_count: 2, workflow_id: "w1" },
      { setup_issue_count: 3, workflow_id: "w1" },
      { setup_issue_count: 1, workflow_id: "w2" },
    ];

    const agg = await aggregateReactAgentMetrics();

    expect(agg.totalAgentChanges).toBe(100);
    expect(agg.preview).toEqual({
      created: 40, applied: 25, keptAsPreview: 5, discarded: 8, applyFailed: 3, undone: 2,
    });
    expect(agg.test).toEqual({ tested: 10, testFailed: 4 });
    // sum(2+3+1)=6 issues, 3 rows with issues, distinct workflows {w1,w2}=2
    expect(agg.setupIssues).toEqual({ changesWithIssues: 3, totalIssues: 6, workflowsNeedingSetup: 2 });
    expect(agg.governance).toEqual({ total: 50, success: 45, denied: 3, failed: 2 });
  });

  it("returns all zeros for empty telemetry", async () => {
    const agg = await aggregateReactAgentMetrics();
    expect(agg.totalAgentChanges).toBe(0);
    expect(agg.preview).toEqual({ created: 0, applied: 0, keptAsPreview: 0, discarded: 0, applyFailed: 0, undone: 0 });
    expect(agg.test).toEqual({ tested: 0, testFailed: 0 });
    expect(agg.setupIssues).toEqual({ changesWithIssues: 0, totalIssues: 0, workflowsNeedingSetup: 0 });
    expect(agg.governance).toEqual({ total: 0, success: 0, denied: 0, failed: 0 });
  });

  it("passes the date range to created_at on every query", async () => {
    await aggregateReactAgentMetrics({ from: "2026-06-01T00:00:00.000Z", to: "2026-06-30T00:00:00.000Z" });
    // Every constructed query bounded created_at with the same from/to.
    for (const q of built) {
      expect(q.gte).toEqual(["created_at", "2026-06-01T00:00:00.000Z"]);
      expect(q.lte).toEqual(["created_at", "2026-06-30T00:00:00.000Z"]);
    }
  });

  it("uses a service-role client with an auditable reason", async () => {
    await aggregateReactAgentMetrics();
    expect(getServiceRoleClientMock).toHaveBeenCalledTimes(1);
    expect(String(getServiceRoleClientMock.mock.calls[0][0])).toMatch(/react-agent metrics/i);
  });

  it("NO-LEAK: only counts + the (setup_issue_count, workflow_id) rollup are ever read — never a content column", async () => {
    // Seed the setup rows with content-shaped fields that MUST be ignored.
    setupRows = [
      { setup_issue_count: 1, workflow_id: "w1", prompt: "SECRET prompt", summary: "SECRET summary", failure_reason: "SECRET boom", diff: { a: "SECRET" } },
    ];
    const agg = await aggregateReactAgentMetrics();

    // The only row-returning select asked for exactly two non-content columns.
    const rowSelects = built.filter((q) => !q.head).map((q) => q.selectArg);
    expect(rowSelects).toEqual(["setup_issue_count, workflow_id"]);
    // Every other query was a head:true count (no rows transferred).
    const headSelects = built.filter((q) => q.head);
    expect(headSelects.length).toBeGreaterThan(0);
    for (const q of headSelects) expect(q.selectArg).toBe("*"); // head:true → no columns materialized

    // And no content leaked into the aggregate.
    expect(JSON.stringify(agg)).not.toMatch(/SECRET/);
  });
});
