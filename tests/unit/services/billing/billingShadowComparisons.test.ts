/**
 * @jest-environment node
 *
 * Tests for services/billing/billingShadowComparisons.ts (Slice 4.COST-14C).
 * The repo is mocked; the COST-14B aggregator runs for real (proves the
 * row → comparison → stats integration).
 */

const mockInsert = jest.fn();
const mockListForRange = jest.fn();
jest.mock("@/repositories/billingShadowComparisons", () => ({
  insertComparison: (...a: unknown[]) => mockInsert(...a),
  listForRange: (...a: unknown[]) => mockListForRange(...a),
  listForWorkflow: jest.fn(),
}));

import {
  recordBillingShadowComparison,
  getReserveReconcileShadowStats,
  getReserveReconcileShadowStatsByWorkflow,
} from "@/services/billing/billingShadowComparisons";
import type { ReserveReconcileShadowComparison } from "@/services/billing/reserveReconcileShadowMode";
import type { BillingShadowComparisonRecord } from "@/repositories/billingShadowComparisons";

beforeEach(() => {
  mockInsert.mockReset();
  mockInsert.mockResolvedValue(undefined);
  mockListForRange.mockReset();
});

function comparison(p: Partial<ReserveReconcileShadowComparison> = {}): ReserveReconcileShadowComparison {
  return {
    billingMode: "shadow",
    status: "computed",
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
    warnings: [{ code: "BRANCHING_UPPER_BOUND", message: "branchy" }],
    policyVersion: "v1",
    ...p,
  };
}

function row(p: Partial<BillingShadowComparisonRecord> = {}): BillingShadowComparisonRecord {
  return {
    id: "c1",
    userId: "user-1",
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
    billingMode: "shadow",
    createdAt: "2026-05-25T00:00:00Z",
    ...p,
  };
}

describe("recordBillingShadowComparison", () => {
  it("maps a comparison → repo insert with warning CODES only", async () => {
    await recordBillingShadowComparison(comparison(), "user-9");
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockInsert.mock.calls[0]![0]).toEqual({
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
    });
    // The warning MESSAGE must not be forwarded to persistence.
    expect(JSON.stringify(mockInsert.mock.calls[0]![0])).not.toContain("branchy");
  });
});

describe("getReserveReconcileShadowStats", () => {
  it("loads rows in range and aggregates via the COST-14B aggregator", async () => {
    mockListForRange.mockResolvedValueOnce([
      row({ workflowId: "wf-a", flatChargedTasks: 1, proposedReconciledTasks: 3, deltaVsFlat: 2, wouldHaveHadEnoughBalance: true, warningCodes: ["BRANCHING_UPPER_BOUND"] }),
      row({ workflowId: "wf-b", flatChargedTasks: 1, proposedReconciledTasks: 0, proposedRefundedTasks: 1, deltaVsFlat: -1, wouldHaveHadEnoughBalance: false, warningCodes: ["UNKNOWN_NODE_TYPE"] }),
    ]);
    const stats = await getReserveReconcileShadowStats({ from: "A", to: "B" });
    expect(mockListForRange).toHaveBeenCalledWith({ from: "A", to: "B" });
    expect(stats.summary.total).toBe(2);
    expect(stats.summary.totalDelta).toBe(1);
    expect(stats.summary.byWarningCode).toEqual({ BRANCHING_UPPER_BOUND: 1, UNKNOWN_NODE_TYPE: 1 });
    expect(stats.delta.higherThanFlatCount).toBe(1);
    expect(stats.delta.lowerThanFlatCount).toBe(1);
    expect(stats.insufficientBalance.insufficientBalanceCount).toBe(1);
  });

  it("empty range → zeroed stats", async () => {
    mockListForRange.mockResolvedValueOnce([]);
    const stats = await getReserveReconcileShadowStats({});
    expect(stats.summary.total).toBe(0);
    expect(stats.summary.totalDelta).toBe(0);
    expect(stats.delta.topPositiveDeltaWorkflows).toEqual([]);
    expect(stats.insufficientBalance.insufficientBalanceCount).toBe(0);
  });

  it("preserves policy versions through aggregation", async () => {
    mockListForRange.mockResolvedValueOnce([row({ policyVersion: "v1" }), row({ policyVersion: "v2", workflowRunId: "run-2" })]);
    const stats = await getReserveReconcileShadowStats({});
    expect(stats.summary.byPolicyVersion).toEqual({ v1: 1, v2: 1 });
  });
});

describe("getReserveReconcileShadowStatsByWorkflow", () => {
  it("groups persisted rows by workflow", async () => {
    mockListForRange.mockResolvedValueOnce([
      row({ workflowId: "wf-a", deltaVsFlat: 2, proposedReconciledTasks: 3 }),
      row({ workflowId: "wf-a", deltaVsFlat: 1, proposedReconciledTasks: 2, workflowRunId: "run-2" }),
      row({ workflowId: "wf-b", deltaVsFlat: -1, proposedReconciledTasks: 0, workflowRunId: "run-3" }),
    ]);
    const g = await getReserveReconcileShadowStatsByWorkflow({ from: "A" });
    expect(g["wf-a"]).toMatchObject({ count: 2, totalDelta: 3 });
    expect(g["wf-b"]).toMatchObject({ count: 1, totalDelta: -1 });
  });
});

describe("no leakage in aggregated output", () => {
  it("aggregates carry no warning messages or secrets", async () => {
    mockListForRange.mockResolvedValueOnce([row({ warningCodes: ["UNKNOWN_NODE_TYPE"] })]);
    const stats = await getReserveReconcileShadowStats({});
    const serialized = JSON.stringify(stats);
    expect(serialized).not.toContain("message");
    expect(serialized).not.toContain("branchy");
  });
});
