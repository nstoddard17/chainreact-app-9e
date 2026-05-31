/**
 * @jest-environment node
 *
 * Tests for services/billing/reserveReconcileShadowMode.ts (Slice 4.COST-14).
 * The estimator is mocked so we control estimatedTasksPerRun + warnings and
 * assert the pure comparison math deterministically.
 */

const mockEstimate = jest.fn();
jest.mock("@/services/billing/workflowCostEstimator", () => ({
  estimateWorkflowTaskCost: (...a: unknown[]) => mockEstimate(...a),
}));

import {
  buildReserveReconcileShadowComparison,
  buildShadowFromRun,
  recordShadowComparison,
} from "@/services/billing/reserveReconcileShadowMode";
import type { WorkflowDefinition } from "@/contracts/workflowDefinition";

const def = { nodes: [], edges: [] } as unknown as WorkflowDefinition;

function setEstimate(estimatedTasksPerRun: number, warnings: unknown[] = [], policyVersion = "v1") {
  mockEstimate.mockReturnValueOnce({ estimatedTasksPerRun, warnings, policyVersion });
}

function build(
  estimate: number,
  actual: number,
  flat: number,
  extra: { warnings?: unknown[]; billingSummary?: { tasksLimit: number; tasksUsed: number; tasksRemaining: number } | null } = {},
) {
  setEstimate(estimate, extra.warnings ?? []);
  return buildReserveReconcileShadowComparison({
    accountId: "u1",
    workflowId: "wf-1",
    workflowRunId: "run-1",
    workflowDefinition: def,
    flatChargedTasks: flat,
    actualUsage: { actualTaskCost: actual },
    billingSummary: extra.billingSummary,
  });
}

beforeEach(() => mockEstimate.mockReset());

describe("buildReserveReconcileShadowComparison — delta math", () => {
  it("flat 1 vs actual 3 (estimate 3) → reconciled 3, refund 0, delta +2", () => {
    const r = build(3, 3, 1);
    expect(r).toMatchObject({
      billingMode: "shadow", status: "computed",
      estimatedTasksPerRun: 3, actualBillableTasks: 3,
      proposedReservedTasks: 3, proposedReconciledTasks: 3, proposedRefundedTasks: 0,
      deltaVsFlat: 2, wouldHaveReserved: true,
    });
  });

  it("flat 1 vs actual 0 (estimate 1) → reconciled 0, refund 1, delta -1", () => {
    const r = build(1, 0, 1);
    expect(r).toMatchObject({ proposedReconciledTasks: 0, proposedRefundedTasks: 1, deltaVsFlat: -1 });
  });

  it("flat 1 vs actual 1 (estimate 1) → delta 0", () => {
    expect(build(1, 1, 1).deltaVsFlat).toBe(0);
  });

  it("estimate 5 actual 3 → reserved 5, reconciled 3, refund 2", () => {
    const r = build(5, 3, 1);
    expect(r).toMatchObject({ proposedReservedTasks: 5, proposedReconciledTasks: 3, proposedRefundedTasks: 2, deltaVsFlat: 2 });
  });

  it("over-actual clamps reconciled to reserved (actual 7 > estimate 3)", () => {
    const r = build(3, 7, 1);
    expect(r).toMatchObject({ proposedReservedTasks: 3, proposedReconciledTasks: 3, proposedRefundedTasks: 0, deltaVsFlat: 2 });
  });

  it("zero estimate → wouldHaveReserved false", () => {
    expect(build(0, 0, 1).wouldHaveReserved).toBe(false);
  });
});

describe("buildReserveReconcileShadowComparison — warnings + policy", () => {
  it("preserves branch + unknown warnings and policyVersion", () => {
    const warnings = [
      { code: "BRANCHING_UPPER_BOUND", message: "branchy" },
      { code: "UNKNOWN_NODE_TYPE", message: "unknown", nodeId: "n9" },
    ];
    setEstimate(4, warnings, "v2");
    const r = buildReserveReconcileShadowComparison({
      accountId: "u1", workflowId: "wf-1", workflowRunId: "run-1",
      workflowDefinition: def, flatChargedTasks: 1, actualUsage: { actualTaskCost: 2 },
    });
    expect(r.warnings).toEqual(warnings);
    expect(r.policyVersion).toBe("v2");
  });
});

describe("buildReserveReconcileShadowComparison — wouldHaveHadEnoughBalance", () => {
  it("true when estimate fits remaining", () => {
    expect(build(4, 4, 1, { billingSummary: { tasksLimit: 100, tasksUsed: 0, tasksRemaining: 10 } }).wouldHaveHadEnoughBalance).toBe(true);
  });
  it("false when estimate exceeds remaining", () => {
    expect(build(4, 4, 1, { billingSummary: { tasksLimit: 100, tasksUsed: 98, tasksRemaining: 2 } }).wouldHaveHadEnoughBalance).toBe(false);
  });
  it("null when no billing summary supplied", () => {
    expect(build(4, 4, 1).wouldHaveHadEnoughBalance).toBeNull();
  });
});

describe("buildShadowFromRun — gate → pre-flat balance mapping", () => {
  it("reconstructs the pre-flat-charge balance (used-flat, limit-used+flat)", () => {
    setEstimate(3, []);
    const r = buildShadowFromRun({
      accountId: "u1", workflowId: "wf-1", workflowRunId: "run-1",
      workflowDefinition: def, flatChargedTasks: 1,
      actualUsage: { actualTaskCost: 2 },
      gate: { used: 5, limit: 100 },
    });
    // tasksRemaining = 100 - 5 + 1 = 96 ≥ estimate 3 → would have had enough.
    expect(r.wouldHaveHadEnoughBalance).toBe(true);
    expect(r.estimatedTasksPerRun).toBe(3);
  });

  it("would NOT have had enough when the pre-flat remaining is below the estimate", () => {
    setEstimate(5, []);
    const r = buildShadowFromRun({
      accountId: "u1", workflowId: "wf-1", workflowRunId: "run-1",
      workflowDefinition: def, flatChargedTasks: 1,
      actualUsage: { actualTaskCost: 1 },
      gate: { used: 99, limit: 100 }, // pre-flat remaining = 100 - 99 + 1 = 2 < 5
    });
    expect(r.wouldHaveHadEnoughBalance).toBe(false);
  });

  it("no gate counters → null wouldHaveHadEnoughBalance", () => {
    setEstimate(2, []);
    const r = buildShadowFromRun({
      accountId: "u1", workflowId: "wf-1", workflowRunId: "run-1",
      workflowDefinition: def, flatChargedTasks: 1,
      actualUsage: { actualTaskCost: 1 },
      gate: {},
    });
    expect(r.wouldHaveHadEnoughBalance).toBeNull();
  });
});

describe("recordShadowComparison — build + log + persist orchestration (fail-open)", () => {
  function deps() {
    const log = jest.fn();
    const persist = jest.fn().mockResolvedValue(undefined);
    return { log, persist };
  }
  const baseArgs = {
    accountId: "u1", workflowId: "wf-1", workflowRunId: "run-1",
    workflowDefinition: def, flatChargedTasks: 1,
    actualUsage: { actualTaskCost: 2 },
    gate: { used: 5, limit: 100 },
  };

  it("logs billing_shadow and persists the comparison + accountId", async () => {
    setEstimate(3, []);
    const { log, persist } = deps();
    await recordShadowComparison({ ...baseArgs, persist, log });
    expect(log).toHaveBeenCalledWith("execution.run.billing_shadow", expect.objectContaining({ billingMode: "shadow" }));
    expect(persist).toHaveBeenCalledTimes(1);
    const [comparison, accountId] = persist.mock.calls[0]!;
    expect(accountId).toBe("u1");
    expect(comparison).toMatchObject({ workflowRunId: "run-1", estimatedTasksPerRun: 3, actualBillableTasks: 2 });
  });

  it("persist failure → logs billing_shadow_persist_failed, never throws", async () => {
    setEstimate(3, []);
    const { log } = deps();
    const persist = jest.fn().mockRejectedValue(new Error("db down"));
    await expect(recordShadowComparison({ ...baseArgs, persist, log })).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith("execution.run.billing_shadow", expect.anything());
    expect(log).toHaveBeenCalledWith("execution.run.billing_shadow_persist_failed", expect.objectContaining({ error: expect.stringMatching(/db down/) }));
  });

  it("build failure (estimator throws) → logs billing_shadow_failed, does NOT persist, never throws", async () => {
    mockEstimate.mockImplementationOnce(() => { throw new Error("est boom"); });
    const { log, persist } = deps();
    await expect(recordShadowComparison({ ...baseArgs, persist, log })).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith("execution.run.billing_shadow_failed", expect.objectContaining({ error: expect.stringMatching(/est boom/) }));
    expect(persist).not.toHaveBeenCalled();
  });
});

describe("buildReserveReconcileShadowComparison — no leakage", () => {
  it("output has no secrets/config even if the definition carried them", () => {
    const secrets = ["ACCESSTOKEN-x", "REFRESHTOKEN-y", "APISECRET-z", "BOTTOKEN-q", "RAWCONFIG-c"];
    const dirtyDef = {
      nodes: [{ id: "a1", kind: "action", provider: "slack", type: "send", position: { x: 0, y: 0 },
        config: { accessToken: "ACCESSTOKEN-x", refreshToken: "REFRESHTOKEN-y", apiSecret: "APISECRET-z", botToken: "BOTTOKEN-q", body: "RAWCONFIG-c" } }],
      edges: [],
    } as unknown as WorkflowDefinition;
    setEstimate(1, []);
    const r = buildReserveReconcileShadowComparison({
      accountId: "u1", workflowId: "wf-1", workflowRunId: "run-1",
      workflowDefinition: dirtyDef, flatChargedTasks: 1, actualUsage: { actualTaskCost: 1 },
    });
    const serialized = JSON.stringify(r);
    for (const m of secrets) expect(serialized).not.toContain(m);
    expect(serialized).not.toContain("config");
  });
});
