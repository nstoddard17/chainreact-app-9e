/**
 * @jest-environment node
 *
 * Tests for services/billing/workflowCostPreview.ts (Slice 4.COST-5).
 * Real COST-2 estimator (registry-backed); mocked workflow + billing repos.
 */

const mockGetById = jest.fn();
jest.mock("@/repositories/workflows", () => ({
  getById: (...a: unknown[]) => mockGetById(...a),
}));

const mockGetUsage = jest.fn();
const mockDeductTasks = jest.fn();
// 4.ACCOUNT-MODEL-9c: the preview reads account-scoped usage
// (accountBillingRepo.getUsage(record.accountId)).
jest.mock("@/repositories/accountBilling", () => ({
  getUsage: (...a: unknown[]) => mockGetUsage(...a),
  deductTasks: (...a: unknown[]) => mockDeductTasks(...a),
}));

const mockInsertEvents = jest.fn();
jest.mock("@/repositories/taskUsageEvents", () => ({
  insertEvents: (...a: unknown[]) => mockInsertEvents(...a),
  listByRun: jest.fn(),
}));

// 4.ACCOUNT-MODEL-7: the preview resolves the caller's account and compares it
// to the workflow's account_id. Map userId → `acct-<userId>` so "user-1"
// matches the seeded "acct-user-1".
jest.mock("@/services/accounts/ensurePersonalAccount", () => ({
  ensurePersonalAccount: (userId: string) =>
    Promise.resolve({ id: `acct-${userId}` }),
}));

import type { WorkflowDefinition, WorkflowNode } from "@/contracts/workflowDefinition";
import {
  buildBillingSummary,
  getWorkflowCostPreview,
} from "@/services/billing/workflowCostPreview";

beforeEach(() => {
  mockGetById.mockReset();
  mockGetUsage.mockReset();
  mockGetUsage.mockResolvedValue(null);
  mockDeductTasks.mockReset();
  mockInsertEvents.mockReset();
});

function node(id: string, kind: "trigger" | "action", provider: string, type: string, config: Record<string, unknown> = {}): WorkflowNode {
  return { id, kind, provider, type, config, position: { x: 0, y: 0 } };
}

function seedWorkflow(def: WorkflowDefinition, accountId = "acct-user-1") {
  mockGetById.mockResolvedValueOnce({ id: "wf-1", accountId, draftDefinition: def });
}

describe("getWorkflowCostPreview", () => {
  it("returns estimator output for a simple workflow", async () => {
    seedWorkflow({
      nodes: [
        node("t", "trigger", "native", "manual.run"),
        node("a1", "action", "gmail", "send_email", { to: ["x@y.com"] }),
        node("a2", "action", "gmail", "create_draft", {}),
        node("a3", "action", "slack", "send_channel_message", { channel: "C", text: "t" }),
      ],
      edges: [],
    });
    const preview = await getWorkflowCostPreview({ workflowId: "wf-1", userId: "user-1" });
    expect(preview).not.toBeNull();
    expect(preview!.estimatedTasksPerRun).toBe(3);
    expect(preview!.nodeBreakdown).toHaveLength(4);
    expect(preview!.policyVersion).toBeTruthy();
    expect(preview!.isEstimate).toBe(true);
    expect(preview!.note).toMatch(/estimate/i);
    // No internal billing-state language leaks to the user-facing payload.
    expect(JSON.stringify(preview)).not.toMatch(/flat 1\/run|reserve|reconcile|temporary/i);
  });

  it("includes a billing summary and computes tasksRemaining (no exceed)", async () => {
    seedWorkflow({
      nodes: [node("t", "trigger", "native", "manual.run"), node("a1", "action", "gmail", "send_email", { to: ["x@y.com"] })],
      edges: [],
    });
    mockGetUsage.mockResolvedValueOnce({ tasksLimit: 100, tasksUsed: 10, periodStartedAt: "x" });
    const preview = await getWorkflowCostPreview({ workflowId: "wf-1", userId: "user-1" });
    expect(preview!.billing).toEqual({
      tasksLimit: 100,
      tasksUsed: 10,
      tasksRemaining: 90,
      wouldExceedCurrentRemaining: false,
    });
  });

  it("flags wouldExceedCurrentRemaining when the estimate exceeds remaining", async () => {
    seedWorkflow({
      nodes: [
        node("t", "trigger", "native", "manual.run"),
        node("a1", "action", "gmail", "send_email", { to: ["x@y.com"] }),
        node("a2", "action", "gmail", "create_draft", {}),
      ],
      edges: [],
    });
    mockGetUsage.mockResolvedValueOnce({ tasksLimit: 100, tasksUsed: 99, periodStartedAt: "x" });
    const preview = await getWorkflowCostPreview({ workflowId: "wf-1", userId: "user-1" });
    expect(preview!.billing!.tasksRemaining).toBe(1);
    expect(preview!.billing!.wouldExceedCurrentRemaining).toBe(true); // 2 > 1
  });

  it("omits the billing summary when usage is unavailable (best-effort)", async () => {
    seedWorkflow({ nodes: [node("t", "trigger", "native", "manual.run")], edges: [] });
    mockGetUsage.mockResolvedValueOnce(null);
    const preview = await getWorkflowCostPreview({ workflowId: "wf-1", userId: "user-1" });
    expect(preview!.billing).toBeNull();
  });

  it("does not fail the preview when the billing read throws", async () => {
    seedWorkflow({ nodes: [node("t", "trigger", "native", "manual.run")], edges: [] });
    mockGetUsage.mockRejectedValueOnce(new Error("billing down"));
    const preview = await getWorkflowCostPreview({ workflowId: "wf-1", userId: "user-1" });
    expect(preview).not.toBeNull();
    expect(preview!.billing).toBeNull();
  });

  it("includes estimator warnings (event-driven trigger)", async () => {
    seedWorkflow({ nodes: [node("t", "trigger", "gmail", "new_email")], edges: [] });
    const preview = await getWorkflowCostPreview({ workflowId: "wf-1", userId: "user-1" });
    expect(preview!.warnings.some((w) => w.code === "EVENT_VOLUME_UNKNOWN")).toBe(true);
  });

  it("preserves cost source provenance (override) in the breakdown", async () => {
    seedWorkflow({
      nodes: [node("t", "trigger", "native", "manual.run"), node("h", "action", "native", "http_request", { url: "https://x", method: "GET" })],
      edges: [],
    });
    const preview = await getWorkflowCostPreview({ workflowId: "wf-1", userId: "user-1" });
    const http = preview!.nodeBreakdown.find((n) => n.nodeId === "h")!;
    expect(http.source).toBe("override");
  });

  it("surfaces unknown nodes with a warning", async () => {
    seedWorkflow({
      nodes: [node("t", "trigger", "native", "manual.run"), node("x", "action", "acme", "do_thing")],
      edges: [],
    });
    const preview = await getWorkflowCostPreview({ workflowId: "wf-1", userId: "user-1" });
    expect(preview!.unknownCostNodes.map((n) => n.nodeId)).toEqual(["x"]);
    expect(preview!.warnings.some((w) => w.code === "UNKNOWN_NODE_TYPE")).toBe(true);
  });

  it("returns 0 estimated tasks for a trigger-only workflow", async () => {
    seedWorkflow({ nodes: [node("t", "trigger", "native", "manual.run")], edges: [] });
    const preview = await getWorkflowCostPreview({ workflowId: "wf-1", userId: "user-1" });
    expect(preview!.estimatedTasksPerRun).toBe(0);
  });

  it("includes the branch upper-bound warning for branching workflows", async () => {
    seedWorkflow({
      nodes: [
        node("t", "trigger", "native", "manual.run"),
        node("if", "action", "native", "if_then_condition"),
        node("a1", "action", "gmail", "send_email", { to: ["x@y.com"] }),
      ],
      edges: [
        { id: "e1", from: "t", to: "if" },
        { id: "e2", from: "if", to: "a1", label: "true" },
      ],
    });
    const preview = await getWorkflowCostPreview({ workflowId: "wf-1", userId: "user-1" });
    expect(preview!.warnings.some((w) => w.code === "BRANCHING_UPPER_BOUND")).toBe(true);
  });

  it("never includes node config / secrets in the preview", async () => {
    const secrets = { accessToken: "ACCESS-aaa", apiSecret: "APISECRET-ccc", clientSecret: "CLIENT-ddd", webhookSecret: "WH-eee", botToken: "BOT-fff", Authorization: "Bearer SECRET-ggg", body: "RAW-BODY-hhh" };
    seedWorkflow({
      nodes: [node("t", "trigger", "native", "manual.run"), node("a1", "action", "gmail", "send_email", { to: ["x@y.com"], ...secrets })],
      edges: [],
    });
    const preview = await getWorkflowCostPreview({ workflowId: "wf-1", userId: "user-1" });
    const serialized = JSON.stringify(preview);
    for (const v of Object.values(secrets)) expect(serialized).not.toContain(v);
  });

  it("does not deduct tasks or write ledger events", async () => {
    seedWorkflow({
      nodes: [node("t", "trigger", "native", "manual.run"), node("a1", "action", "gmail", "send_email", { to: ["x@y.com"] })],
      edges: [],
    });
    await getWorkflowCostPreview({ workflowId: "wf-1", userId: "user-1" });
    expect(mockDeductTasks).not.toHaveBeenCalled();
    expect(mockInsertEvents).not.toHaveBeenCalled();
  });

  it("returns null when the workflow does not exist", async () => {
    mockGetById.mockResolvedValueOnce(null);
    expect(await getWorkflowCostPreview({ workflowId: "missing", userId: "user-1" })).toBeNull();
  });

  it("returns null when the workflow is in another account", async () => {
    seedWorkflow({ nodes: [node("t", "trigger", "native", "manual.run")], edges: [] }, "acct-other-user");
    expect(await getWorkflowCostPreview({ workflowId: "wf-1", userId: "user-1" })).toBeNull();
  });
});

describe("buildBillingSummary", () => {
  it("computes remaining + exceed flag", () => {
    expect(buildBillingSummary({ tasksLimit: 100, tasksUsed: 95 }, 3)).toEqual({
      tasksLimit: 100,
      tasksUsed: 95,
      tasksRemaining: 5,
      wouldExceedCurrentRemaining: false,
    });
    expect(buildBillingSummary({ tasksLimit: 100, tasksUsed: 99 }, 3).wouldExceedCurrentRemaining).toBe(true);
  });

  it("never reports negative remaining", () => {
    expect(buildBillingSummary({ tasksLimit: 100, tasksUsed: 130 }, 1).tasksRemaining).toBe(0);
  });
});
