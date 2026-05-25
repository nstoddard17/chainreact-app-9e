/**
 * @jest-environment node
 *
 * Tests for services/analytics/reserveReconcileShadowStats.ts (Slice 4.COST-14B).
 * Pure aggregator — fed synthetic shadow comparisons, no DB.
 */

import type { ReserveReconcileShadowComparison } from "@/services/billing/reserveReconcileShadowMode";
import {
  summarizeShadowComparisons,
  groupShadowByWorkflow,
  getShadowDeltaStats,
  getShadowInsufficientBalanceStats,
} from "@/services/analytics/reserveReconcileShadowStats";

function cmp(p: Partial<ReserveReconcileShadowComparison> = {}): ReserveReconcileShadowComparison {
  const flat = p.flatChargedTasks ?? 1;
  const reconciled = p.proposedReconciledTasks ?? 1;
  return {
    billingMode: "shadow",
    status: "computed",
    workflowId: "wf-1",
    workflowRunId: "run-1",
    flatChargedTasks: flat,
    estimatedTasksPerRun: p.estimatedTasksPerRun ?? reconciled,
    actualBillableTasks: p.actualBillableTasks ?? reconciled,
    proposedReservedTasks: p.proposedReservedTasks ?? (p.estimatedTasksPerRun ?? reconciled),
    proposedReconciledTasks: reconciled,
    proposedRefundedTasks: p.proposedRefundedTasks ?? 0,
    deltaVsFlat: p.deltaVsFlat ?? reconciled - flat,
    wouldHaveReserved: p.wouldHaveReserved ?? true,
    wouldHaveHadEnoughBalance: p.wouldHaveHadEnoughBalance ?? null,
    warnings: p.warnings ?? [],
    policyVersion: p.policyVersion ?? "v1",
    ...p,
  };
}

describe("summarizeShadowComparisons", () => {
  it("returns zeros for an empty list", () => {
    expect(summarizeShadowComparisons([])).toEqual({
      total: 0,
      flatTotalCharged: 0,
      proposedTotalCharged: 0,
      totalDelta: 0,
      averageDelta: 0,
      higherThanFlatCount: 0,
      lowerThanFlatCount: 0,
      sameAsFlatCount: 0,
      totalEstimatedTasks: 0,
      totalActualBillableTasks: 0,
      estimateVsActualVariance: 0,
      proposedRefundsTotal: 0,
      insufficientBalanceCount: 0,
      byWarningCode: {},
      byPolicyVersion: {},
    });
  });

  it("classifies higher / lower / same vs flat and totals delta", () => {
    const s = summarizeShadowComparisons([
      cmp({ flatChargedTasks: 1, proposedReconciledTasks: 3 }), // +2 higher
      cmp({ flatChargedTasks: 1, proposedReconciledTasks: 0, proposedRefundedTasks: 1, estimatedTasksPerRun: 1 }), // -1 lower
      cmp({ flatChargedTasks: 1, proposedReconciledTasks: 1 }), // 0 same
    ]);
    expect(s.total).toBe(3);
    expect(s.higherThanFlatCount).toBe(1);
    expect(s.lowerThanFlatCount).toBe(1);
    expect(s.sameAsFlatCount).toBe(1);
    expect(s.flatTotalCharged).toBe(3);
    expect(s.proposedTotalCharged).toBe(4); // 3 + 0 + 1
    expect(s.totalDelta).toBe(1); // +2 -1 +0
    expect(s.averageDelta).toBeCloseTo(1 / 3);
  });

  it("sums refunds and computes estimate-vs-actual variance", () => {
    const s = summarizeShadowComparisons([
      cmp({ estimatedTasksPerRun: 5, actualBillableTasks: 3, proposedReconciledTasks: 3, proposedRefundedTasks: 2 }),
      cmp({ estimatedTasksPerRun: 2, actualBillableTasks: 2, proposedReconciledTasks: 2, proposedRefundedTasks: 0 }),
    ]);
    expect(s.totalEstimatedTasks).toBe(7);
    expect(s.totalActualBillableTasks).toBe(5);
    expect(s.estimateVsActualVariance).toBe(2);
    expect(s.proposedRefundsTotal).toBe(2);
  });

  it("counts insufficient-balance, warning codes, and policy versions", () => {
    const s = summarizeShadowComparisons([
      cmp({ wouldHaveHadEnoughBalance: false, warnings: [{ code: "BRANCHING_UPPER_BOUND", message: "b" }], policyVersion: "v1" }),
      cmp({ wouldHaveHadEnoughBalance: false, warnings: [{ code: "UNKNOWN_NODE_TYPE", message: "u", nodeId: "n1" }, { code: "BRANCHING_UPPER_BOUND", message: "b" }], policyVersion: "v2" }),
      cmp({ wouldHaveHadEnoughBalance: true, warnings: [{ code: "EVENT_VOLUME_UNKNOWN", message: "e" }], policyVersion: "v1" }),
      cmp({ wouldHaveHadEnoughBalance: null, warnings: [{ code: "SCHEDULE_ESTIMATE_UNAVAILABLE", message: "s" }], policyVersion: "v1" }),
    ]);
    expect(s.insufficientBalanceCount).toBe(2);
    expect(s.byWarningCode).toEqual({
      BRANCHING_UPPER_BOUND: 2,
      UNKNOWN_NODE_TYPE: 1,
      EVENT_VOLUME_UNKNOWN: 1,
      SCHEDULE_ESTIMATE_UNAVAILABLE: 1,
    });
    expect(s.byPolicyVersion).toEqual({ v1: 3, v2: 1 });
  });
});

describe("groupShadowByWorkflow", () => {
  it("aggregates per workflow", () => {
    const g = groupShadowByWorkflow([
      cmp({ workflowId: "wf-a", flatChargedTasks: 1, proposedReconciledTasks: 3 }),
      cmp({ workflowId: "wf-a", flatChargedTasks: 1, proposedReconciledTasks: 2 }),
      cmp({ workflowId: "wf-b", flatChargedTasks: 1, proposedReconciledTasks: 0, wouldHaveHadEnoughBalance: false }),
    ]);
    expect(g["wf-a"]).toMatchObject({ count: 2, flatTotal: 2, proposedTotal: 5, totalDelta: 3 });
    expect(g["wf-b"]).toMatchObject({ count: 1, totalDelta: -1, insufficientBalanceCount: 1 });
  });
});

describe("getShadowDeltaStats", () => {
  it("ranks workflows by largest positive and negative aggregate delta", () => {
    const stats = getShadowDeltaStats([
      cmp({ workflowId: "wf-up", flatChargedTasks: 1, proposedReconciledTasks: 5 }), // +4
      cmp({ workflowId: "wf-down", flatChargedTasks: 1, proposedReconciledTasks: 0, estimatedTasksPerRun: 1 }), // -1
      cmp({ workflowId: "wf-mid", flatChargedTasks: 1, proposedReconciledTasks: 2 }), // +1
    ]);
    expect(stats.topPositiveDeltaWorkflows.map((w) => w.workflowId)).toEqual(["wf-up", "wf-mid"]);
    expect(stats.topNegativeDeltaWorkflows.map((w) => w.workflowId)).toEqual(["wf-down"]);
    expect(stats.totalDelta).toBe(4); // +4 -1 +1
  });

  it("honors the limit", () => {
    const stats = getShadowDeltaStats(
      [
        cmp({ workflowId: "a", flatChargedTasks: 1, proposedReconciledTasks: 4 }),
        cmp({ workflowId: "b", flatChargedTasks: 1, proposedReconciledTasks: 3 }),
        cmp({ workflowId: "c", flatChargedTasks: 1, proposedReconciledTasks: 2 }),
      ],
      2,
    );
    expect(stats.topPositiveDeltaWorkflows).toHaveLength(2);
  });
});

describe("getShadowInsufficientBalanceStats", () => {
  it("totals insufficient-balance and lists recurring workflows", () => {
    const stats = getShadowInsufficientBalanceStats([
      cmp({ workflowId: "wf-x", wouldHaveHadEnoughBalance: false }),
      cmp({ workflowId: "wf-x", wouldHaveHadEnoughBalance: false }),
      cmp({ workflowId: "wf-y", wouldHaveHadEnoughBalance: false }),
      cmp({ workflowId: "wf-z", wouldHaveHadEnoughBalance: true }),
    ]);
    expect(stats.insufficientBalanceCount).toBe(3);
    expect(stats.workflowsWithInsufficientBalance.map((w) => w.workflowId)).toEqual(["wf-x", "wf-y"]);
    expect(stats.workflowsWithInsufficientBalance[0]).toMatchObject({ workflowId: "wf-x", insufficientBalanceCount: 2 });
  });

  it("empty when no insufficient-balance signals", () => {
    const stats = getShadowInsufficientBalanceStats([cmp({ wouldHaveHadEnoughBalance: true })]);
    expect(stats.insufficientBalanceCount).toBe(0);
    expect(stats.workflowsWithInsufficientBalance).toEqual([]);
  });
});

describe("no secret / message leakage", () => {
  it("aggregates count warning CODES only — tainted warning messages never appear", () => {
    const out = JSON.stringify({
      summary: summarizeShadowComparisons([
        cmp({ warnings: [{ code: "UNKNOWN_NODE_TYPE", message: "SECRET-BOTTOKEN-xyz" }] }),
      ]),
      delta: getShadowDeltaStats([cmp({ warnings: [{ code: "BRANCHING_UPPER_BOUND", message: "ACCESSTOKEN-abc" }] })]),
    });
    expect(out).not.toContain("SECRET-BOTTOKEN-xyz");
    expect(out).not.toContain("ACCESSTOKEN-abc");
    expect(out).not.toContain("message");
  });
});
