/**
 * @jest-environment node
 *
 * Tests for the AI-REPAIR-3B dry-run readiness service
 * (`services/ai/repair/assessRepairApplyReadiness.ts`).
 *
 * The deterministic patch validator is mocked (its verdict is controlled here) so
 * these isolate the ORCHESTRATION: derive the fresh definition / revision / active
 * state / current node ids from the record, re-validate, and run the REAL
 * `assessApplyReadiness` contract — returning the verdict with NO persistence. The
 * contract's own allow/block matrix is covered exhaustively by the AI-REPAIR-3A suite.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const mockValidate = jest.fn();
jest.mock("@/services/workflows/patch/validateWorkflowPatch", () => ({
  validateWorkflowPatch: (...a: unknown[]) => mockValidate(...a),
}));

import { assessRepairApplyReadiness } from "@/services/ai/repair/assessRepairApplyReadiness";
import type { WorkflowRecord } from "@/repositories/workflows";

function record(over: Record<string, unknown> = {}): WorkflowRecord {
  return {
    id: "wf-1",
    accountId: "acct-1",
    name: "WF",
    state: "disabled",
    draftDefinition: {
      nodes: [{ id: "n1", kind: "action", provider: "slack", type: "send_channel_message", config: {}, position: { x: 0, y: 0 } }],
      edges: [],
    },
    updatedAt: "rev-1",
    createdByUserId: "u1",
    ...over,
  } as unknown as WorkflowRecord;
}

const safeOps = [{ op: "updateNodeConfig", nodeId: "n1", config: { text: "hi" } }];

beforeEach(() => {
  mockValidate.mockReset();
  mockValidate.mockReturnValue({ ok: true, requiresConfirmation: false });
});

describe("assessRepairApplyReadiness — orchestration", () => {
  it("a safe patch on an inactive workflow with matching revision is applyable", () => {
    const r = assessRepairApplyReadiness({ record: record(), workflowId: "wf-1", operations: safeOps, baseRevision: "rev-1" });
    expect(r.readiness.applyable).toBe(true);
    expect(r.currentRevision).toBe("rev-1");
  });

  it("re-validates against the FRESH definition + revision (passes record def + currentRevision)", () => {
    assessRepairApplyReadiness({ record: record({ updatedAt: "rev-7" }), workflowId: "wf-1", operations: safeOps, baseRevision: "rev-7" });
    expect(mockValidate).toHaveBeenCalledTimes(1);
    const [patchArg, defArg, optsArg] = mockValidate.mock.calls[0]!;
    expect((patchArg as { operations: unknown[] }).operations).toEqual(safeOps);
    expect((defArg as { nodes: unknown[] }).nodes).toHaveLength(1);
    expect(optsArg).toEqual({ currentRevision: "rev-7" });
  });

  it("blocks when the graph changed since preview (baseRevision != fresh revision)", () => {
    const r = assessRepairApplyReadiness({ record: record({ updatedAt: "rev-9" }), workflowId: "wf-1", operations: safeOps, baseRevision: "rev-1" });
    expect(r.readiness.applyable).toBe(false);
    expect(r.readiness.blockedCategories).toContain("GRAPH_CHANGED_SINCE_PREVIEW");
  });

  it("blocks a stale preview (baseRevision != previewRevision)", () => {
    const r = assessRepairApplyReadiness({ record: record(), workflowId: "wf-1", operations: safeOps, baseRevision: "rev-2", previewRevision: "rev-1" });
    expect(r.readiness.blockedCategories).toContain("STALE_PREVIEW");
  });

  it("blocks failed deterministic validation as a safe VALIDATION_FAILED (no raw errors)", () => {
    mockValidate.mockReturnValue({ ok: false, requiresConfirmation: false });
    const r = assessRepairApplyReadiness({ record: record(), workflowId: "wf-1", operations: safeOps, baseRevision: "rev-1" });
    expect(r.readiness.applyable).toBe(false);
    expect(r.readiness.blockedCategories).toContain("VALIDATION_FAILED");
  });

  it("blocks when the validator throws (collapses to NO_VALIDATION_METADATA)", () => {
    mockValidate.mockImplementation(() => { throw new Error("boom"); });
    const r = assessRepairApplyReadiness({ record: record(), workflowId: "wf-1", operations: safeOps, baseRevision: "rev-1" });
    expect(r.readiness.blockedCategories).toContain("NO_VALIDATION_METADATA");
  });

  it("derives workflowActive from record.state: active → TRIGGER_CHANGE_ACTIVE", () => {
    const ops = [{ op: "replaceTrigger", node: { id: "t1", kind: "trigger", provider: "slack", type: "message_posted", config: {}, position: { x: 0, y: 0 } } }];
    expect(assessRepairApplyReadiness({ record: record({ state: "active" }), workflowId: "wf-1", operations: ops, baseRevision: "rev-1" }).readiness.blockedCategories).toContain("TRIGGER_CHANGE_ACTIVE");
    expect(assessRepairApplyReadiness({ record: record({ state: "disabled" }), workflowId: "wf-1", operations: ops, baseRevision: "rev-1" }).readiness.blockedCategories).toContain("TRIGGER_CHANGE_REQUIRES_LIFECYCLE");
  });

  it("blocks destructive deletion + whole-graph replacement using the record's node ids", () => {
    const r = assessRepairApplyReadiness({
      record: record({ draftDefinition: { nodes: [{ id: "n1" }, { id: "n2" }], edges: [] } }),
      workflowId: "wf-1",
      operations: [{ op: "removeNode", nodeId: "n1" }, { op: "removeNode", nodeId: "n2" }],
      baseRevision: "rev-1",
    });
    expect(r.readiness.applyable).toBe(false);
    expect(r.readiness.blockedCategories).toEqual(expect.arrayContaining(["DESTRUCTIVE_DELETION", "WHOLE_GRAPH_REPLACEMENT"]));
  });

  it("raw model text (non-array operations) is blocked, no throw", () => {
    const r = assessRepairApplyReadiness({ record: record(), workflowId: "wf-1", operations: "please fix it", baseRevision: "rev-1" });
    expect(r.readiness.blockedCategories).toContain("RAW_MODEL_TEXT");
  });
});

describe("assessRepairApplyReadiness — no-leak", () => {
  it("a secret/credential config write is blocked and the verdict serializes no value/key", () => {
    const r = assessRepairApplyReadiness({
      record: record(),
      workflowId: "wf-1",
      operations: [{ op: "updateNodeConfig", nodeId: "n1", config: { apiKey: "SECRET_TOKEN_X", accountId: "acct_live_9" } }],
      baseRevision: "rev-1",
    });
    expect(r.readiness.applyable).toBe(false);
    const json = JSON.stringify(r);
    for (const forbidden of ["SECRET_TOKEN_X", "acct_live_9", "apiKey", "accountId"]) {
      expect(json).not.toContain(forbidden);
    }
  });
});

describe("assessRepairApplyReadiness — persistence boundary", () => {
  it("the service imports NO save / persist / run / activation path", () => {
    const src = readFileSync(resolve(process.cwd(), "services/ai/repair/assessRepairApplyReadiness.ts"), "utf8");
    const importSpec = /(?:import\s[^"']*?from\s*|import\s*|require\s*\(\s*)["']([^"']+)["']/g;
    const specifiers = [...src.matchAll(importSpec)].map((m) => m[1] ?? "");
    expect(specifiers.length).toBeGreaterThan(0);
    for (const spec of specifiers) {
      expect(spec).not.toMatch(/saveDraftDefinition|updateDraftDefinition|applyWorkflowPatch|workflows\/lifecycle|triggers\/lifecycle|execution\/engine/i);
    }
  });
});
