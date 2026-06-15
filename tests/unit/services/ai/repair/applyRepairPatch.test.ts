/**
 * @jest-environment node
 *
 * Tests for the AI-REPAIR-3D guarded apply service
 * (`services/ai/repair/applyRepairPatch.ts`).
 *
 * The deterministic validator + the optimistic repository write are mocked; the REAL
 * `assessApplyReadiness` + `executeWorkflowPatch` run. So these isolate the persistence
 * orchestration: gate on readiness → execute in memory → persist DRAFT ONLY via the
 * optimistic helper → safe result. The only write that can ever happen is the single
 * `updateDraftDefinitionIfRevisionMatches` call.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const mockValidate = jest.fn();
jest.mock("@/services/workflows/patch/validateWorkflowPatch", () => ({
  validateWorkflowPatch: (...a: unknown[]) => mockValidate(...a),
}));

const mockUpdate = jest.fn();
jest.mock("@/repositories/workflows", () => ({
  updateDraftDefinitionIfRevisionMatches: (...a: unknown[]) => mockUpdate(...a),
}));

import { applyRepairPatch } from "@/services/ai/repair/applyRepairPatch";
import type { WorkflowRecord } from "@/repositories/workflows";

function record(over: Record<string, unknown> = {}): WorkflowRecord {
  return {
    id: "wf-1",
    accountId: "acct-1",
    name: "WF",
    state: "disabled",
    draftDefinition: {
      nodes: [
        { id: "n1", kind: "action", provider: "slack", type: "send_channel_message", config: { channel: "C1", text: "hi" }, position: { x: 0, y: 0 } },
        { id: "n2", kind: "action", provider: "gmail", type: "send_email", config: { subject: "s" }, position: { x: 0, y: 1 } },
      ],
      edges: [{ id: "e1", from: "n1", to: "n2" }],
    },
    updatedAt: "rev-1",
    createdByUserId: "u1",
    ...over,
  } as unknown as WorkflowRecord;
}

const safeOps = [{ op: "updateNodeConfig", nodeId: "n1", config: { text: "updated" } }];

function input(over: Record<string, unknown> = {}) {
  return { record: record(), workflowId: "wf-1", operations: safeOps, baseRevision: "rev-1", ...over };
}

beforeEach(() => {
  mockValidate.mockReset();
  mockValidate.mockReturnValue({ ok: true, requiresConfirmation: false });
  mockUpdate.mockReset();
  mockUpdate.mockResolvedValue({ ...record(), updatedAt: "rev-2" });
});

describe("applyRepairPatch — persists only when every gate passes", () => {
  it("a safe patch persists the DRAFT and returns the new revision + summary", async () => {
    const r = await applyRepairPatch(input());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.currentRevision).toBe("rev-2");
    expect(r.appliedOperations).toEqual([{ op: "updateNodeConfig", nodeId: "n1", fields: ["text"] }]);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it("persists exactly the expected change; unrelated fields + structure preserved", async () => {
    await applyRepairPatch(input());
    const arg = mockUpdate.mock.calls[0]![0] as { accountId: string; workflowId: string; expectedUpdatedAt: string; draftDefinition: { nodes: { id: string; config: Record<string, unknown> }[]; edges: unknown[] } };
    expect(arg.accountId).toBe("acct-1");
    expect(arg.workflowId).toBe("wf-1");
    expect(arg.expectedUpdatedAt).toBe("rev-1"); // optimistic token = the loaded revision
    const n1 = arg.draftDefinition.nodes.find((n) => n.id === "n1")!;
    expect(n1.config).toEqual({ channel: "C1", text: "updated" }); // intended changed, channel preserved
    expect(arg.draftDefinition.nodes.find((n) => n.id === "n2")!.config).toEqual({ subject: "s" }); // unrelated node untouched
    expect(arg.draftDefinition.edges).toEqual([{ id: "e1", from: "n1", to: "n2" }]); // structure intact
  });
});

describe("applyRepairPatch — fail closed (no write)", () => {
  it("rejects readiness applyable:false (failed validation) with NOT_APPLYABLE, no write", async () => {
    mockValidate.mockReturnValue({ ok: false, requiresConfirmation: false });
    const r = await applyRepairPatch(input());
    expect(r).toMatchObject({ ok: false, code: "NOT_APPLYABLE" });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects a stale preview / graph-changed as STALE_PATCH, no write", async () => {
    const r = await applyRepairPatch(input({ baseRevision: "rev-0" })); // != currentRevision "rev-1"
    expect(r).toMatchObject({ ok: false, code: "STALE_PATCH" });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects a secret write before any execution / write", async () => {
    const r = await applyRepairPatch(input({ operations: [{ op: "updateNodeConfig", nodeId: "n1", config: { apiKey: "x" } }] }));
    expect(r).toMatchObject({ ok: false, code: "NOT_APPLYABLE" });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects an active-workflow trigger change, no write", async () => {
    const ops = [{ op: "replaceTrigger", node: { id: "t1", kind: "trigger", provider: "slack", type: "message_posted", config: {}, position: { x: 0, y: 0 } } }];
    const r = await applyRepairPatch(input({ record: record({ state: "active" }), operations: ops }));
    expect(r).toMatchObject({ ok: false, code: "NOT_APPLYABLE" });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("does NOT persist raw model text (non-array operations)", async () => {
    const r = await applyRepairPatch(input({ operations: "please fix my workflow" }));
    expect(r.ok).toBe(false);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects an executor failure (op targets a missing node), no write", async () => {
    const r = await applyRepairPatch(input({ operations: [{ op: "updateNodeConfig", nodeId: "ghost", config: { text: "x" } }] }));
    expect(r).toMatchObject({ ok: false, code: "EXECUTION_FAILED" });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("an optimistic-concurrency miss (repo returns null) → safe STALE_PATCH", async () => {
    mockUpdate.mockResolvedValue(null);
    const r = await applyRepairPatch(input());
    expect(r).toMatchObject({ ok: false, code: "STALE_PATCH" });
  });

  it("a repository throw collapses to a safe EXECUTION_FAILED (no raw error)", async () => {
    mockUpdate.mockRejectedValue(new Error("relation \"workflows\" column \"draft_definition\" violates"));
    const r = await applyRepairPatch(input());
    expect(r).toMatchObject({ ok: false, code: "EXECUTION_FAILED" });
    expect(JSON.stringify(r)).not.toContain("draft_definition");
  });
});

describe("applyRepairPatch — no-leak + import boundary", () => {
  it("the result serializes no config value / secret / account role", async () => {
    mockUpdate.mockResolvedValue({ ...record(), updatedAt: "rev-2" });
    const r = await applyRepairPatch(input({ operations: [{ op: "updateNodeConfig", nodeId: "n1", config: { text: "SECRET_VALUE_Z" } }] }));
    const json = JSON.stringify(r);
    expect(json).not.toContain("SECRET_VALUE_Z");
    expect(json).not.toContain("updatedDefinition");
  });

  it("imports ONLY the optimistic draft write — no save/run/activation/trigger path", () => {
    const src = readFileSync(resolve(process.cwd(), "services/ai/repair/applyRepairPatch.ts"), "utf8");
    const importSpec = /(?:import\s[^"']*?from\s*|import\s*|require\s*\(\s*)["']([^"']+)["']/g;
    const specifiers = [...src.matchAll(importSpec)].map((m) => m[1] ?? "");
    for (const spec of specifiers) {
      expect(spec).not.toMatch(/saveDraftDefinition|triggers\/lifecycle|workflows\/lifecycle|execution\/engine|runWorkflow|registerTrigger|activateWorkflow|aiCreditGate|aiCostEvents|modelClient/i);
    }
    // It MUST use the optimistic, account-scoped draft writer.
    expect(src).toContain("updateDraftDefinitionIfRevisionMatches");
  });
});
