/**
 * @jest-environment node
 *
 * Tests for services/ai/apply/applyWorkflowPatch.ts (Slice 4.AI-6).
 *
 * Mocks the workflows repo (getById + updateDraftDefinition) and userBilling
 * (no-deduction guard). The AI-3 validator, the discovery registry, and the
 * COST-2 estimator all run for real, so apply is exercised end-to-end.
 */
const mockGetById = jest.fn();
const mockUpdateDraftDefinition = jest.fn();
const mockDeductTasks = jest.fn();

jest.mock("@/repositories/workflows", () => ({
  getById: (...a: unknown[]) => mockGetById(...a),
  updateDraftDefinition: (...a: unknown[]) => mockUpdateDraftDefinition(...a),
}));
jest.mock("@/repositories/userBilling", () => ({
  deductTasks: (...a: unknown[]) => mockDeductTasks(...a),
  getUsage: jest.fn(),
}));

import { applyWorkflowPatchForAI } from "@/services/ai/apply/applyWorkflowPatch";
import type { WorkflowDefinition, WorkflowNode } from "@/contracts/workflowDefinition";
import type { WorkflowRecord } from "@/repositories/workflows";
import type { PatchOperation, WorkflowPatch } from "@/services/workflows/patch/types";

function node(
  id: string,
  kind: "trigger" | "action",
  provider: string,
  type: string,
  config: Record<string, unknown> = {},
): WorkflowNode {
  return { id, kind, provider, type, config, position: { x: 0, y: 0 } };
}

const baseDef = (): WorkflowDefinition => ({
  nodes: [node("t", "trigger", "gmail", "new_email"), node("a1", "action", "gmail", "send_email", { to: "x@y.com" })],
  edges: [{ id: "e1", from: "t", to: "a1" }],
});

function makeRecord(def: WorkflowDefinition, over: Partial<WorkflowRecord> = {}): WorkflowRecord {
  return {
    id: "wf1",
    userId: "owner-1",
    name: "WF",
    state: "draft",
    disabledReason: null,
    disabledContext: null,
    activeRevisionId: null,
    draftDefinition: def,
    deletedAt: null,
    createdAt: "2026-05-25T00:00:00Z",
    updatedAt: "rev-1",
    ...over,
  };
}

function patch(operations: PatchOperation[], extra: Partial<WorkflowPatch> = {}): WorkflowPatch {
  return { patchId: "p1", workflowId: "wf1", baseRevision: "rev-1", operations, summary: "s", rationale: "r", ...extra };
}

const APPLY = { userId: "owner-1", workflowId: "wf1" };

function persistedDef(): WorkflowDefinition {
  return mockUpdateDraftDefinition.mock.calls[0]![1] as WorkflowDefinition;
}

beforeEach(() => {
  mockGetById.mockReset();
  mockUpdateDraftDefinition.mockReset();
  mockDeductTasks.mockReset();
  mockGetById.mockResolvedValue(makeRecord(baseDef()));
  mockUpdateDraftDefinition.mockImplementation((_id: string, def: WorkflowDefinition) =>
    Promise.resolve(makeRecord(def, { updatedAt: "rev-2" })),
  );
});

describe("applyWorkflowPatchForAI — ownership / loading", () => {
  it("returns NOT_FOUND when the workflow is missing", async () => {
    mockGetById.mockResolvedValue(null);
    const res = await applyWorkflowPatchForAI({ ...APPLY, patch: patch([{ op: "moveNode", nodeId: "a1", position: { x: 1, y: 1 } }]) });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("NOT_FOUND");
    expect(mockUpdateDraftDefinition).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND when the caller does not own the workflow", async () => {
    mockGetById.mockResolvedValue(makeRecord(baseDef(), { userId: "someone-else" }));
    const res = await applyWorkflowPatchForAI({ ...APPLY, patch: patch([{ op: "moveNode", nodeId: "a1", position: { x: 1, y: 1 } }]) });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("NOT_FOUND");
    expect(mockUpdateDraftDefinition).not.toHaveBeenCalled();
  });

  it("loads + applies a valid low-risk patch", async () => {
    const res = await applyWorkflowPatchForAI({ ...APPLY, patch: patch([{ op: "moveNode", nodeId: "a1", position: { x: 9, y: 9 } }]) });
    expect(res.ok).toBe(true);
    expect(mockGetById).toHaveBeenCalledWith("wf1");
    expect(mockUpdateDraftDefinition).toHaveBeenCalledTimes(1);
    if (!res.ok) return;
    expect(res.appliedOperationCount).toBe(1);
    expect(res.updatedAt).toBe("rev-2");
  });
});

describe("applyWorkflowPatchForAI — validation (nothing persisted on failure)", () => {
  it("rejects an unknown action without persisting", async () => {
    const res = await applyWorkflowPatchForAI({ ...APPLY, patch: patch([{ op: "addNode", node: node("a2", "action", "acme", "do_thing") }]) });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("VALIDATION_FAILED");
    expect(res.errors?.some((e) => e.code === "UNKNOWN_ACTION")).toBe(true);
    expect(mockUpdateDraftDefinition).not.toHaveBeenCalled();
  });

  it("does not mutate the original definition on failure", async () => {
    const def = baseDef();
    mockGetById.mockResolvedValue(makeRecord(def));
    const snapshot = JSON.stringify(def);
    await applyWorkflowPatchForAI({ ...APPLY, patch: patch([{ op: "addNode", node: node("a2", "action", "acme", "do_thing") }]) });
    expect(JSON.stringify(def)).toBe(snapshot);
  });

  it.each<[string, PatchOperation[]]>([
    ["invalid config (missing required)", [{ op: "addNode", node: node("a2", "action", "gmail", "send_email", { subject: "Hi" }) }]],
    ["duplicate node id", [{ op: "addNode", node: node("a1", "action", "gmail", "create_draft", {}) }]],
    ["multiple triggers", [{ op: "addNode", node: node("t2", "trigger", "native", "manual.run") }]],
    ["edge to a missing node", [{ op: "addEdge", edge: { id: "e9", from: "a1", to: "ghost" } }]],
  ])("rejects %s without persisting", async (_label, ops) => {
    const res = await applyWorkflowPatchForAI({ ...APPLY, patch: patch(ops) });
    expect(res.ok).toBe(false);
    expect(mockUpdateDraftDefinition).not.toHaveBeenCalled();
  });

  it("is all-or-nothing: a single bad op rejects the whole patch", async () => {
    const res = await applyWorkflowPatchForAI({
      ...APPLY,
      patch: patch([
        { op: "moveNode", nodeId: "a1", position: { x: 1, y: 1 } },
        { op: "addEdge", edge: { id: "e9", from: "a1", to: "ghost" } },
      ]),
    });
    expect(res.ok).toBe(false);
    expect(mockUpdateDraftDefinition).not.toHaveBeenCalled();
  });
});

describe("applyWorkflowPatchForAI — confirmation", () => {
  const refundPatch = () =>
    patch([
      { op: "addNode", node: node("r", "action", "stripe", "create_refund", { chargeId: "ch_1" }) },
      { op: "addEdge", edge: { id: "e2", from: "a1", to: "r" } },
    ]);

  it("blocks a high-risk patch without confirmation", async () => {
    const res = await applyWorkflowPatchForAI({ ...APPLY, patch: refundPatch() });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("CONFIRMATION_REQUIRED");
    expect(mockUpdateDraftDefinition).not.toHaveBeenCalled();
  });

  it("applies a high-risk patch with explicit confirmation", async () => {
    const res = await applyWorkflowPatchForAI({ ...APPLY, patch: refundPatch(), confirmation: { confirmed: true } });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.riskLevel).toBe("high");
    expect(res.requiresConfirmation).toBe(true);
    expect(mockUpdateDraftDefinition).toHaveBeenCalledTimes(1);
  });

  it("re-prompts when the accepted risk level does not match the validated risk", async () => {
    const res = await applyWorkflowPatchForAI({ ...APPLY, patch: refundPatch(), confirmation: { confirmed: true, acceptedRiskLevel: "low" } });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("CONFIRMATION_REQUIRED");
  });

  it("applies when the accepted risk level matches", async () => {
    const res = await applyWorkflowPatchForAI({ ...APPLY, patch: refundPatch(), confirmation: { confirmed: true, acceptedRiskLevel: "high" } });
    expect(res.ok).toBe(true);
  });

  it("applies a low-risk patch without confirmation", async () => {
    const res = await applyWorkflowPatchForAI({ ...APPLY, patch: patch([{ op: "moveNode", nodeId: "a1", position: { x: 2, y: 2 } }]) });
    expect(res.ok).toBe(true);
  });

  it("confirmation cannot bypass an invalid patch", async () => {
    const res = await applyWorkflowPatchForAI({ ...APPLY, patch: patch([{ op: "addNode", node: node("a2", "action", "acme", "do_thing") }]), confirmation: { confirmed: true } });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("VALIDATION_FAILED");
    expect(mockUpdateDraftDefinition).not.toHaveBeenCalled();
  });
});

describe("applyWorkflowPatchForAI — persistence", () => {
  it("persists an added node", async () => {
    const res = await applyWorkflowPatchForAI({
      ...APPLY,
      patch: patch([
        { op: "addNode", node: node("a2", "action", "slack", "send_channel_message", { channel: "C1", text: "hi" }) },
        { op: "addEdge", edge: { id: "e2", from: "a1", to: "a2" } },
      ]),
    });
    expect(res.ok).toBe(true);
    expect(persistedDef().nodes.some((n) => n.id === "a2")).toBe(true);
    expect(persistedDef().edges.some((e) => e.id === "e2")).toBe(true);
  });

  it("persists merged config from updateNodeConfig", async () => {
    await applyWorkflowPatchForAI({ ...APPLY, patch: patch([{ op: "updateNodeConfig", nodeId: "a1", config: { to: "new@y.com", subject: "Hi" } }]) });
    const a1 = persistedDef().nodes.find((n) => n.id === "a1")!;
    expect(a1.config.to).toBe("new@y.com");
    expect(a1.config.subject).toBe("Hi");
  });

  it("persists a node removal and its edges", async () => {
    await applyWorkflowPatchForAI({ ...APPLY, patch: patch([{ op: "removeNode", nodeId: "a1" }]) });
    expect(persistedDef().nodes.some((n) => n.id === "a1")).toBe(false);
    expect(persistedDef().edges.some((e) => e.from === "a1" || e.to === "a1")).toBe(false);
  });

  it("persists a single trigger after replaceTrigger (confirmation-required)", async () => {
    const res = await applyWorkflowPatchForAI({
      ...APPLY,
      patch: patch([{ op: "replaceTrigger", node: node("t2", "trigger", "native", "manual.run") }]),
      confirmation: { confirmed: true },
    });
    expect(res.ok).toBe(true);
    expect(persistedDef().nodes.filter((n) => n.kind === "trigger")).toHaveLength(1);
  });
});

describe("applyWorkflowPatchForAI — concurrency", () => {
  it("rejects a stale patch whose baseRevision != the workflow revision", async () => {
    const res = await applyWorkflowPatchForAI({ ...APPLY, patch: patch([{ op: "moveNode", nodeId: "a1", position: { x: 1, y: 1 } }], { baseRevision: "old" }) });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("STALE_PATCH");
    expect(mockUpdateDraftDefinition).not.toHaveBeenCalled();
  });
});

describe("applyWorkflowPatchForAI — no redacted candidate / secret preservation", () => {
  it("preserves an existing secret config value untouched and never leaks it", async () => {
    mockGetById.mockResolvedValue(
      makeRecord({
        nodes: [node("t", "trigger", "gmail", "new_email"), node("a1", "action", "gmail", "send_email", { to: "x@y.com", apiKey: "REAL-SECRET" })],
        edges: [{ id: "e1", from: "t", to: "a1" }],
      }),
    );
    const res = await applyWorkflowPatchForAI({ ...APPLY, patch: patch([{ op: "moveNode", nodeId: "a1", position: { x: 3, y: 3 } }]) });
    expect(res.ok).toBe(true);
    const a1 = persistedDef().nodes.find((n) => n.id === "a1")!;
    expect(a1.config.apiKey).toBe("REAL-SECRET"); // preserved, never [REDACTED]
    expect(JSON.stringify(res)).not.toContain("REAL-SECRET"); // result never leaks it
  });
});

describe("applyWorkflowPatchForAI — risk / cost / no-leak", () => {
  it("includes deterministic risk + COST-2 estimate and never deducts", async () => {
    const res = await applyWorkflowPatchForAI({ ...APPLY, patch: patch([{ op: "moveNode", nodeId: "a1", position: { x: 1, y: 1 } }]) });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.riskLevel).toBe("low");
    expect(res.taskCostEstimate).toBeDefined();
    expect(res.taskCostEstimate!.policyVersion).toBeTruthy();
    expect(mockDeductTasks).not.toHaveBeenCalled();
  });

  it("result never leaks config values on success", async () => {
    const res = await applyWorkflowPatchForAI({
      ...APPLY,
      patch: patch([{ op: "updateNodeConfig", nodeId: "a1", config: { to: "victim@example.com", subject: "private body" } }]),
    });
    expect(res.ok).toBe(true);
    const serialized = JSON.stringify(res);
    expect(serialized).not.toContain("victim@example.com");
    expect(serialized).not.toContain("private body");
  });

  it("failure result scrubs secret values + secret-shaped key names", async () => {
    const res = await applyWorkflowPatchForAI({
      ...APPLY,
      patch: patch([
        {
          op: "addNode",
          node: node("x", "action", "acme", "do_thing", { accessToken: "ACCESS-aaa", Authorization: "Bearer SECRET-ggg" }),
        },
      ]),
    });
    expect(res.ok).toBe(false);
    const serialized = JSON.stringify(res);
    for (const v of ["ACCESS-aaa", "Bearer SECRET-ggg", "accessToken", "Authorization"]) {
      expect(serialized).not.toContain(v);
    }
  });
});
