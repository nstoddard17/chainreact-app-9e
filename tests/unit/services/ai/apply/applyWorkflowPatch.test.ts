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
const mockGuardedUpdate = jest.fn();
const mockDeductTasks = jest.fn();

jest.mock("@/repositories/workflows", () => ({
  getById: (...a: unknown[]) => mockGetById(...a),
  updateDraftDefinitionIfRevisionMatches: (...a: unknown[]) => mockGuardedUpdate(...a),
}));
jest.mock("@/repositories/accountBilling", () => ({
  deductTasks: (...a: unknown[]) => mockDeductTasks(...a),
  getUsage: jest.fn(),
}));
// 4.ACCOUNT-MODEL-7: apply resolves the caller's account and compares it to
// the workflow's account_id (and the guarded update is account-keyed). Map
// userId → `acct-<userId>` so "owner-1" matches the record's "acct-owner-1".
jest.mock("@/services/accounts/ensurePersonalAccount", () => ({
  ensurePersonalAccount: (userId: string) =>
    Promise.resolve({ id: `acct-${userId}` }),
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
    accountId: "acct-owner-1",
    createdByUserId: "owner-1",
    name: "WF",
    state: "draft",
    disabledReason: null,
    disabledContext: null,
    activeRevisionId: null,
    draftDefinition: def,
    deletedAt: null,
    folderId: null,
    deletedByUserId: null,
    purgeAfter: null,
    deletedFromFolderId: null,
    deleteOperationId: null,
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
  return (mockGuardedUpdate.mock.calls[0]![0] as { draftDefinition: WorkflowDefinition }).draftDefinition;
}

beforeEach(() => {
  mockGetById.mockReset();
  mockGuardedUpdate.mockReset();
  mockDeductTasks.mockReset();
  mockGetById.mockResolvedValue(makeRecord(baseDef()));
  mockGuardedUpdate.mockImplementation((input: { draftDefinition: WorkflowDefinition }) =>
    Promise.resolve(makeRecord(input.draftDefinition, { updatedAt: "rev-2" })),
  );
});

describe("applyWorkflowPatchForAI — ownership / loading", () => {
  it("returns NOT_FOUND when the workflow is missing", async () => {
    mockGetById.mockResolvedValue(null);
    const res = await applyWorkflowPatchForAI({ ...APPLY, patch: patch([{ op: "moveNode", nodeId: "a1", position: { x: 1, y: 1 } }]) });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("NOT_FOUND");
    expect(mockGuardedUpdate).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND when the workflow is in another account", async () => {
    mockGetById.mockResolvedValue(makeRecord(baseDef(), { accountId: "acct-someone-else" }));
    const res = await applyWorkflowPatchForAI({ ...APPLY, patch: patch([{ op: "moveNode", nodeId: "a1", position: { x: 1, y: 1 } }]) });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("NOT_FOUND");
    expect(mockGuardedUpdate).not.toHaveBeenCalled();
  });

  it("loads + applies a valid low-risk patch", async () => {
    const res = await applyWorkflowPatchForAI({ ...APPLY, patch: patch([{ op: "moveNode", nodeId: "a1", position: { x: 9, y: 9 } }]) });
    expect(res.ok).toBe(true);
    expect(mockGetById).toHaveBeenCalledWith("wf1");
    expect(mockGuardedUpdate).toHaveBeenCalledTimes(1);
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
    expect(mockGuardedUpdate).not.toHaveBeenCalled();
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
    expect(mockGuardedUpdate).not.toHaveBeenCalled();
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
    expect(mockGuardedUpdate).not.toHaveBeenCalled();
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
    expect(mockGuardedUpdate).not.toHaveBeenCalled();
  });

  it("applies a high-risk patch with explicit confirmation", async () => {
    const res = await applyWorkflowPatchForAI({ ...APPLY, patch: refundPatch(), confirmation: { confirmed: true } });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.riskLevel).toBe("high");
    expect(res.requiresConfirmation).toBe(true);
    expect(mockGuardedUpdate).toHaveBeenCalledTimes(1);
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
    expect(mockGuardedUpdate).not.toHaveBeenCalled();
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
    // Slice 4.BUILDER-NODE-IDENTITY-1 — the model's patch-local ids ("a2"/"e2")
    // are replaced with system-owned ids before persistence; assert by content.
    const added = persistedDef().nodes.find(
      (n) => n.provider === "slack" && n.type === "send_channel_message",
    );
    expect(added).toBeDefined();
    expect(added!.id).not.toBe("a2");
    // The edge wires the existing node a1 → the new node's SYSTEM id.
    expect(persistedDef().edges.some((e) => e.from === "a1" && e.to === added!.id)).toBe(true);
    // The model's scratch edge id never persists.
    expect(persistedDef().edges.some((e) => e.id === "e2")).toBe(false);
  });

  // Slice 4.AI-35G — an AI-applied simple linear workflow is normalized to the
  // builder's vertical column (trigger on top, actions stacked below).
  it("lays out a simple linear AI-applied workflow vertically (trigger above actions)", async () => {
    const res = await applyWorkflowPatchForAI({
      ...APPLY,
      patch: patch([
        { op: "addNode", node: node("a2", "action", "slack", "send_channel_message", { channel: "C1", text: "hi" }) },
        { op: "addEdge", edge: { id: "e2", from: "a1", to: "a2" } },
      ]),
    });
    expect(res.ok).toBe(true);
    // The added node has a system id (not "a2"); find it by content.
    const added = persistedDef().nodes.find(
      (n) => n.provider === "slack" && n.type === "send_channel_message",
    )!;
    const pos = (id: string) => persistedDef().nodes.find((n) => n.id === id)!.position;
    // Base def starts with t + a1 BOTH at (0,0); after apply the chain t→a1→added
    // is re-stacked vertically, all x-aligned.
    expect(pos("t").y).toBeLessThan(pos("a1").y);
    expect(pos("a1").y).toBeLessThan(added.position.y);
    expect(new Set([pos("t").x, pos("a1").x, added.position.x]).size).toBe(1);
  });

  it("does NOT relayout positions on a pure config edit (updateNodeConfig)", async () => {
    // a1 starts at (0,0); a config edit must not move it.
    await applyWorkflowPatchForAI({ ...APPLY, patch: patch([{ op: "updateNodeConfig", nodeId: "a1", config: { subject: "Hi" } }]) });
    expect(persistedDef().nodes.find((n) => n.id === "a1")!.position).toEqual({ x: 0, y: 0 });
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
  it("rejects a read-time stale patch whose baseRevision != the workflow revision", async () => {
    const res = await applyWorkflowPatchForAI({ ...APPLY, patch: patch([{ op: "moveNode", nodeId: "a1", position: { x: 1, y: 1 } }], { baseRevision: "old" }) });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("STALE_PATCH");
    expect(mockGuardedUpdate).not.toHaveBeenCalled();
  });

  it("persists via the guarded update with the workflow's revision token", async () => {
    await applyWorkflowPatchForAI({ ...APPLY, patch: patch([{ op: "moveNode", nodeId: "a1", position: { x: 1, y: 1 } }]) });
    expect(mockGuardedUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: "acct-owner-1", workflowId: "wf1", expectedUpdatedAt: "rev-1" }),
    );
  });

  it("rejects a WRITE-time stale patch when the guarded update matches no row", async () => {
    // Read-time check passes (baseRevision === updatedAt), but the workflow
    // changed between read and guarded write → the guard returns null.
    mockGuardedUpdate.mockResolvedValue(null);
    const res = await applyWorkflowPatchForAI({ ...APPLY, patch: patch([{ op: "moveNode", nodeId: "a1", position: { x: 1, y: 1 } }]) });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("STALE_PATCH");
    expect(mockGuardedUpdate).toHaveBeenCalledTimes(1);
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
