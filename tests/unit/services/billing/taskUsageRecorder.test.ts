/**
 * @jest-environment node
 *
 * Tests for services/billing/taskUsageRecorder.ts (Slice 4.COST-3).
 * `computeRunTaskUsage` runs against the REAL discovery registry. The DB
 * writer is exercised with a mocked taskUsageEvents repo.
 */

const mockInsertEvents = jest.fn();
jest.mock("@/repositories/taskUsageEvents", () => ({
  insertEvents: (...a: unknown[]) => mockInsertEvents(...a),
  listByRun: jest.fn(),
}));

import type { WorkflowDefinition, WorkflowNode } from "@/contracts/workflowDefinition";
import type { WorkflowRunStep } from "@/repositories/workflowRuns";
import {
  computeRunTaskUsage,
  recordRunActuals,
} from "@/services/billing/taskUsageRecorder";

beforeEach(() => mockInsertEvents.mockReset());

function node(id: string, kind: "trigger" | "action", provider: string, type: string, config: Record<string, unknown> = {}): WorkflowNode {
  return { id, kind, provider, type, config, position: { x: 0, y: 0 } };
}
function step(nodeId: string, status: WorkflowRunStep["status"]): WorkflowRunStep {
  return { nodeId, status };
}

describe("computeRunTaskUsage", () => {
  it("records a successful provider action as a billable event (1 task)", () => {
    const def: WorkflowDefinition = {
      nodes: [node("t", "trigger", "gmail", "new_email"), node("a1", "action", "gmail", "send_email", { to: ["x@y.com"] })],
      edges: [{ id: "e1", from: "t", to: "a1" }],
    };
    const usage = computeRunTaskUsage(def, [step("t", "succeeded"), step("a1", "succeeded")]);
    expect(usage.actualTaskCost).toBe(1);
    expect(usage.nodeEvents).toHaveLength(1);
    expect(usage.nodeEvents[0]).toMatchObject({ nodeId: "a1", provider: "gmail", nodeType: "send_email", tasksCharged: 1, costReason: "provider_action" });
  });

  it("records native:http_request success as billable", () => {
    const def: WorkflowDefinition = {
      nodes: [node("t", "trigger", "native", "manual.run"), node("h", "action", "native", "http_request", { url: "https://x", method: "GET" })],
      edges: [{ id: "e1", from: "t", to: "h" }],
    };
    const usage = computeRunTaskUsage(def, [step("t", "succeeded"), step("h", "succeeded")]);
    expect(usage.actualTaskCost).toBe(1);
    expect(usage.nodeEvents[0]).toMatchObject({ nodeId: "h", costReason: "native_external_egress", source: "override" });
  });

  it("does NOT record native control-flow as billable", () => {
    const def: WorkflowDefinition = {
      nodes: [node("t", "trigger", "native", "manual.run"), node("r", "action", "native", "router", { routes: [] })],
      edges: [{ id: "e1", from: "t", to: "r" }],
    };
    const usage = computeRunTaskUsage(def, [step("t", "succeeded"), step("r", "succeeded")]);
    expect(usage.actualTaskCost).toBe(0);
    expect(usage.nodeEvents).toHaveLength(0);
  });

  it("does NOT record triggers as billable", () => {
    const def: WorkflowDefinition = {
      nodes: [node("t", "trigger", "gmail", "new_email")],
      edges: [],
    };
    const usage = computeRunTaskUsage(def, [step("t", "succeeded")]);
    expect(usage.actualTaskCost).toBe(0);
    expect(usage.nodeEvents).toHaveLength(0);
  });

  it("does NOT record a FAILED billable node", () => {
    const def: WorkflowDefinition = {
      nodes: [node("t", "trigger", "native", "manual.run"), node("a1", "action", "gmail", "send_email", { to: ["x@y.com"] })],
      edges: [{ id: "e1", from: "t", to: "a1" }],
    };
    const usage = computeRunTaskUsage(def, [step("t", "succeeded"), step("a1", "failed")]);
    expect(usage.actualTaskCost).toBe(0);
    expect(usage.nodeEvents).toHaveLength(0);
  });

  it("does NOT record a SKIPPED node", () => {
    const def: WorkflowDefinition = {
      nodes: [node("t", "trigger", "native", "manual.run"), node("a1", "action", "gmail", "send_email", { to: ["x@y.com"] })],
      edges: [{ id: "e1", from: "t", to: "a1" }],
    };
    const usage = computeRunTaskUsage(def, [step("t", "succeeded"), step("a1", "skipped")]);
    expect(usage.actualTaskCost).toBe(0);
  });

  it("includes the estimate + policy version", () => {
    const def: WorkflowDefinition = {
      nodes: [node("t", "trigger", "native", "manual.run"), node("a1", "action", "gmail", "send_email", { to: ["x@y.com"] }), node("a2", "action", "gmail", "create_draft", {})],
      edges: [],
    };
    const usage = computeRunTaskUsage(def, [step("a1", "succeeded")]);
    expect(usage.estimatedTaskCost).toBe(2); // 2 billable actions estimated
    expect(usage.actualTaskCost).toBe(1); // only a1 succeeded
    expect(usage.policyVersion).toBeTruthy();
  });

  it("never copies node config / secrets into the usage output", () => {
    const secrets = { accessToken: "ACCESS-aaa", apiSecret: "APISECRET-ccc", Authorization: "Bearer SECRET-ggg" };
    const def: WorkflowDefinition = {
      nodes: [node("t", "trigger", "native", "manual.run"), node("a1", "action", "gmail", "send_email", { to: ["x@y.com"], ...secrets })],
      edges: [],
    };
    const usage = computeRunTaskUsage(def, [step("a1", "succeeded")]);
    const serialized = JSON.stringify(usage);
    for (const v of Object.values(secrets)) expect(serialized).not.toContain(v);
  });
});

describe("recordRunActuals", () => {
  it("writes a run_estimate_recorded event + one node_task_charged per billable node", async () => {
    await recordRunActuals({
      runId: "run-1",
      workflowId: "wf-1",
      userId: "user-1",
      usage: {
        estimatedTaskCost: 2,
        actualTaskCost: 1,
        policyVersion: "v1",
        estimateSummary: { billableNodeCount: 2, nonBillableNodeCount: 1, unknownNodeCount: 0, warningCount: 1 },
        nodeEvents: [{ nodeId: "a1", provider: "gmail", nodeType: "send_email", nodeKind: "action", tasksCharged: 1, chargeOn: "success", costReason: "provider_action", source: "default_policy" }],
      },
    });
    expect(mockInsertEvents).toHaveBeenCalledTimes(1);
    const rows = mockInsertEvents.mock.calls[0]![0] as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    const estimate = rows.find((r) => r.eventType === "run_estimate_recorded")!;
    expect(estimate).toMatchObject({ estimatedTasks: 2, actualTasks: 1, costPolicyVersion: "v1", testMode: false, billable: false });
    const charged = rows.find((r) => r.eventType === "node_task_charged")!;
    expect(charged).toMatchObject({ nodeId: "a1", billable: true, tasksCharged: 1, testMode: false, costPolicyVersion: "v1" });
    // COST-4 — cost provenance preserved in ledger metadata (enum only).
    expect(charged.metadata).toEqual({ source: "default_policy" });
  });

  it("preserves an 'override' source from the policy in ledger metadata", async () => {
    await recordRunActuals({
      runId: "run-3",
      workflowId: "wf-1",
      userId: "user-1",
      usage: {
        estimatedTaskCost: 1,
        actualTaskCost: 1,
        policyVersion: "v1",
        estimateSummary: { billableNodeCount: 1, nonBillableNodeCount: 0, unknownNodeCount: 0, warningCount: 0 },
        nodeEvents: [{ nodeId: "h", provider: "native", nodeType: "http_request", nodeKind: "action", tasksCharged: 1, chargeOn: "success", costReason: "native_external_egress", source: "override" }],
      },
    });
    const rows = mockInsertEvents.mock.calls[0]![0] as Array<Record<string, unknown>>;
    const charged = rows.find((r) => r.eventType === "node_task_charged")!;
    expect(charged.metadata).toEqual({ source: "override" });
  });

  it("records test_mode=false (test runs never reach this path) and no secrets in rows", async () => {
    await recordRunActuals({
      runId: "run-2",
      workflowId: "wf-1",
      userId: "user-1",
      usage: {
        estimatedTaskCost: 0,
        actualTaskCost: 0,
        policyVersion: "v1",
        estimateSummary: { billableNodeCount: 0, nonBillableNodeCount: 0, unknownNodeCount: 0, warningCount: 0 },
        nodeEvents: [],
      },
    });
    const rows = mockInsertEvents.mock.calls[0]![0] as Array<Record<string, unknown>>;
    const serialized = JSON.stringify(rows);
    expect(serialized).not.toContain("accessToken");
    expect(serialized).not.toContain("Authorization");
    expect(rows.every((r) => r.testMode === false)).toBe(true);
  });
});
