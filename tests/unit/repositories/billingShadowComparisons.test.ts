/**
 * @jest-environment node
 *
 * Tests for repositories/billingShadowComparisons.ts (Slice 4.COST-14C).
 * Mocks the service-role client (upsert insert + thenable range read).
 */

interface UpsertState {
  upserted: unknown;
  opts: unknown;
  error: { message: string } | null;
}
function makeUpsertClient(state: UpsertState) {
  return {
    from: jest.fn(() => ({
      upsert: jest.fn(async (row: unknown, opts: unknown) => {
        state.upserted = row;
        state.opts = opts;
        return { error: state.error };
      }),
    })),
  };
}

interface ListState {
  data: unknown;
  error: { message: string } | null;
}
function makeRangeClient(state: ListState) {
  const calls: Record<string, unknown[]> = {};
  const builder: Record<string, unknown> = {};
  const chain = (name: string) =>
    jest.fn((...args: unknown[]) => {
      calls[name] = args;
      return builder;
    });
  Object.assign(builder, {
    select: chain("select"),
    gte: chain("gte"),
    lte: chain("lte"),
    eq: chain("eq"),
    order: chain("order"),
    limit: chain("limit"),
    then: (resolve: (v: ListState) => unknown) => resolve({ data: state.data, error: state.error }),
  });
  return { client: { from: jest.fn(() => builder) }, calls };
}

const mockServiceRole: { current: unknown } = { current: null };
jest.mock("@/repositories/supabase/serviceRoleClient", () => ({
  getServiceRoleClient: jest.fn(() => mockServiceRole.current),
}));

import {
  insertComparison,
  listForRange,
  listForWorkflow,
  type BillingShadowComparisonInsert,
} from "@/repositories/billingShadowComparisons";

const sample: BillingShadowComparisonInsert = {
  accountId: "user-1",
  workflowId: "wf-1",
  workflowRunId: "run-1",
  flatChargedTasks: 1,
  estimatedTasksPerRun: 3,
  actualBillableTasks: 2,
  proposedReservedTasks: 3,
  proposedReconciledTasks: 2,
  proposedRefundedTasks: 1,
  deltaVsFlat: 1,
  wouldHaveReserved: true,
  wouldHaveHadEnoughBalance: false,
  warningCodes: ["BRANCHING_UPPER_BOUND"],
  policyVersion: "v1",
};

describe("billingShadowComparisons.insertComparison", () => {
  it("maps camelCase → snake_case and upserts idempotently on workflow_run_id", async () => {
    const state: UpsertState = { upserted: null, opts: null, error: null };
    mockServiceRole.current = makeUpsertClient(state);
    await insertComparison(sample);
    expect(state.upserted).toMatchObject({
      account_id: "user-1",
      workflow_id: "wf-1",
      workflow_run_id: "run-1",
      flat_charged_tasks: 1,
      estimated_tasks_per_run: 3,
      actual_billable_tasks: 2,
      proposed_reserved_tasks: 3,
      proposed_reconciled_tasks: 2,
      proposed_refunded_tasks: 1,
      delta_vs_flat: 1,
      would_have_reserved: true,
      would_have_had_enough_balance: false,
      warning_codes: ["BRANCHING_UPPER_BOUND"],
      policy_version: "v1",
      billing_mode: "shadow",
    });
    expect(state.opts).toEqual({ onConflict: "workflow_run_id", ignoreDuplicates: true });
  });

  it("throws on insert error", async () => {
    mockServiceRole.current = makeUpsertClient({ upserted: null, opts: null, error: { message: "boom" } });
    await expect(insertComparison(sample)).rejects.toThrow(/billing_shadow_comparisons.insertComparison failed: boom/);
  });
});

describe("billingShadowComparisons.listForRange", () => {
  function row(over: Record<string, unknown> = {}) {
    return {
      id: "c1", account_id: "user-1", workflow_id: "wf-1", workflow_run_id: "run-1",
      flat_charged_tasks: 1, estimated_tasks_per_run: 3, actual_billable_tasks: 2,
      proposed_reserved_tasks: 3, proposed_reconciled_tasks: 2, proposed_refunded_tasks: 1,
      delta_vs_flat: 1, would_have_reserved: true, would_have_had_enough_balance: false,
      warning_codes: ["UNKNOWN_NODE_TYPE"], policy_version: "v1", billing_mode: "shadow",
      anonymized_at: null, ledger_purge_after: null,
      created_at: "2026-05-25T00:00:00Z", ...over,
    };
  }

  it("wires from/to/accountId/workflowId/limit and maps rows", async () => {
    const { client, calls } = makeRangeClient({ data: [row()], error: null });
    mockServiceRole.current = client;
    const records = await listForRange({ from: "2026-05-01", to: "2026-05-31", accountId: "user-1", workflowId: "wf-1", limit: 50 });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      id: "c1", workflowRunId: "run-1", flatChargedTasks: 1, deltaVsFlat: 1,
      wouldHaveHadEnoughBalance: false, warningCodes: ["UNKNOWN_NODE_TYPE"], billingMode: "shadow",
    });
    expect(calls.gte).toEqual(["created_at", "2026-05-01"]);
    expect(calls.lte).toEqual(["created_at", "2026-05-31"]);
    expect(calls.limit).toEqual([50]);
  });

  it("no filters → [] and throws on error", async () => {
    const empty = makeRangeClient({ data: [], error: null });
    mockServiceRole.current = empty.client;
    expect(await listForRange()).toEqual([]);
    expect(empty.calls.gte).toBeUndefined();

    const failing = makeRangeClient({ data: null, error: { message: "down" } });
    mockServiceRole.current = failing.client;
    await expect(listForRange({ from: "A" })).rejects.toThrow(/billing_shadow_comparisons.listForRange failed: down/);
  });

  it("listForWorkflow filters by workflow_id", async () => {
    const { client, calls } = makeRangeClient({ data: [row()], error: null });
    mockServiceRole.current = client;
    const records = await listForWorkflow("wf-1");
    expect(records).toHaveLength(1);
    expect(calls.eq).toEqual(["workflow_id", "wf-1"]);
  });

  /**
   * SUPABASE-TABLE-TYPING-1C. account_id / workflow_id / workflow_run_id are
   * NULLABLE (20260531000008 ledger anonymization) and billing_mode is
   * CHECK-constrained text the generator can only describe as `string`.
   */
  it("maps a retention-anonymized row to null ids instead of claiming strings", async () => {
    const { client } = makeRangeClient({
      data: [row({ account_id: null, workflow_id: null, workflow_run_id: null, anonymized_at: "2026-06-01T00:00:00Z" })],
      error: null,
    });
    mockServiceRole.current = client;
    const [record] = await listForRange();
    expect(record).toMatchObject({
      accountId: null,
      workflowId: null,
      workflowRunId: null,
      anonymizedAt: "2026-06-01T00:00:00Z",
      // The statistical payload survives anonymization untouched.
      flatChargedTasks: 1,
      deltaVsFlat: 1,
      billingMode: "shadow",
    });
  });

  it("reports anonymizedAt as null for an attributable row", async () => {
    const { client } = makeRangeClient({ data: [row()], error: null });
    mockServiceRole.current = client;
    const [record] = await listForRange();
    expect(record!.anonymizedAt).toBeNull();
    expect(record!.accountId).toBe("user-1");
  });

  it("fails closed on a billing_mode outside the CHECK constraint", async () => {
    const { client } = makeRangeClient({ data: [row({ billing_mode: "live" })], error: null });
    mockServiceRole.current = client;
    await expect(listForRange()).rejects.toThrow(
      /billing_shadow_comparisons\.billing_mode: unexpected value "live"/,
    );
  });

  it("fails closed on a missing billing_mode rather than assuming shadow", async () => {
    const { client } = makeRangeClient({ data: [row({ billing_mode: null })], error: null });
    mockServiceRole.current = client;
    await expect(listForRange()).rejects.toThrow(/billing_shadow_comparisons\.billing_mode/);
  });
});
