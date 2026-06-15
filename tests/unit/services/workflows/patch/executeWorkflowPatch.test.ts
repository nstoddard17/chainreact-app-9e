/**
 * @jest-environment node
 *
 * Tests for the AI-REPAIR-3C deterministic in-memory patch executor
 * (`services/workflows/patch/executeWorkflowPatch.ts`).
 *
 * Pure: runs the REAL applier + REAL safety classifier (nothing mocked). Proves only
 * the apply-eligible ops execute, blocked ops are fail-closed even when the caller
 * passes a wrongly-applyable readiness, the input is never mutated, the summary leaks
 * no values, and the result validates. NO persistence — returns a new in-memory def.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { WorkflowDefinitionSchema } from "@/contracts/workflowDefinition";
import { executeWorkflowPatch } from "@/services/workflows/patch/executeWorkflowPatch";
import type { ApplyReadiness } from "@/services/workflows/patch/applySafety";
import type { PatchOperation } from "@/services/workflows/patch/types";

function baseDef() {
  return {
    nodes: [
      { id: "t1", kind: "trigger", provider: "slack", type: "message_posted", config: {}, position: { x: 0, y: 0 } },
      { id: "n1", kind: "action", provider: "slack", type: "send_channel_message", config: { channel: "C1", text: "hi" }, position: { x: 0, y: 1 } },
      { id: "n2", kind: "action", provider: "gmail", type: "send_email", config: { subject: "s" }, position: { x: 0, y: 2 } },
    ],
    edges: [
      { id: "e1", from: "t1", to: "n1" },
      { id: "e2", from: "n1", to: "n2" },
    ],
  };
}

const okReadiness = (operationKinds: string[] = []): ApplyReadiness => ({
  applyable: true,
  blocks: [],
  blockedCategories: [],
  requiresConfirmation: false,
  operationKinds,
});

function exec(ops: unknown[], readiness: ApplyReadiness | null | undefined = okReadiness(), opts = {}) {
  return executeWorkflowPatch(baseDef() as never, ops as PatchOperation[], readiness, opts);
}

describe("executeWorkflowPatch — allowed operations", () => {
  it("updateNodeConfig changes only the intended field, preserves others + structure", () => {
    const r = exec([{ op: "updateNodeConfig", nodeId: "n1", config: { text: "new" } }]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const n1 = r.updatedDefinition.nodes.find((n) => n.id === "n1")!;
    expect(n1.config).toEqual({ channel: "C1", text: "new" }); // intended changed, unrelated preserved
    expect(r.updatedDefinition.nodes.map((n) => n.id)).toEqual(["t1", "n1", "n2"]); // structure intact
    expect(r.updatedDefinition.edges).toEqual(baseDef().edges);
    expect(r.appliedOperations).toEqual([{ op: "updateNodeConfig", nodeId: "n1", fields: ["text"] }]);
  });

  it("repairVariableReference updates only the targeted reference", () => {
    const r = exec([{ op: "repairVariableReference", nodeId: "n2", fieldPath: "subject", newReference: "{{n1.output}}" }]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.updatedDefinition.nodes.find((n) => n.id === "n2")!.config.subject).toBe("{{n1.output}}");
    expect(r.updatedDefinition.nodes.find((n) => n.id === "n1")!.config).toEqual({ channel: "C1", text: "hi" });
  });

  it("addEdge adds only the validated edge", () => {
    const r = exec([{ op: "addEdge", edge: { id: "e3", from: "t1", to: "n2" } }]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.updatedDefinition.edges.map((e) => e.id)).toEqual(["e1", "e2", "e3"]);
    expect(r.appliedOperations).toEqual([{ op: "addEdge", edgeId: "e3" }]);
  });

  it("removeEdge removes only the targeted edge", () => {
    const r = exec([{ op: "removeEdge", edgeId: "e2" }]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.updatedDefinition.edges.map((e) => e.id)).toEqual(["e1"]);
  });

  it("replaceEdge replaces exactly the intended edge in place", () => {
    const r = exec([{ op: "replaceEdge", edgeId: "e2", edge: { id: "e2b", from: "n1", to: "n2" } }]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.updatedDefinition.edges.map((e) => e.id)).toEqual(["e1", "e2b"]);
  });

  it("moveNode changes only position metadata", () => {
    const r = exec([{ op: "moveNode", nodeId: "n1", position: { x: 9, y: 9 } }]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const n1 = r.updatedDefinition.nodes.find((n) => n.id === "n1")!;
    expect(n1.position).toEqual({ x: 9, y: 9 });
    expect(n1.config).toEqual({ channel: "C1", text: "hi" });
  });

  it("a recipient/destination change executes ONLY with explicit confirmation", () => {
    const op = [{ op: "updateNodeConfig", nodeId: "n1", config: { channel: "C2" } }];
    expect(exec(op).ok).toBe(false); // blocked without confirmation
    const r = exec(op, okReadiness(), { recipientChangeConfirmed: true });
    expect(r.ok).toBe(true);
  });
});

describe("executeWorkflowPatch — fail closed", () => {
  it("rejects an applyable:false readiness", () => {
    const r = exec([{ op: "moveNode", nodeId: "n1", position: { x: 1, y: 1 } }], { ...okReadiness(), applyable: false, blocks: [{ code: "SECRET_WRITE", message: "x" }], blockedCategories: ["SECRET_WRITE"] });
    expect(r).toMatchObject({ ok: false, code: "NOT_APPLYABLE" });
  });

  it("rejects missing readiness (null / undefined)", () => {
    const ops = [{ op: "moveNode", nodeId: "n1", position: { x: 1, y: 1 } }] as PatchOperation[];
    expect(executeWorkflowPatch(baseDef() as never, ops, null)).toMatchObject({ ok: false, code: "NOT_APPLYABLE" });
    expect(executeWorkflowPatch(baseDef() as never, ops, undefined)).toMatchObject({ ok: false, code: "NOT_APPLYABLE" });
  });

  it("rejects an unknown operation type (defense-in-depth)", () => {
    const r = exec([{ op: "frobnicate", nodeId: "n1" }]);
    expect(r).toMatchObject({ ok: false, code: "OPERATION_NOT_EXECUTABLE" });
    if (r.ok) return;
    expect(r.blocks?.map((b) => b.code)).toContain("UNKNOWN_OPERATION");
  });

  it("rejects addNode / removeNode / whole-graph replacement", () => {
    expect(exec([{ op: "addNode", node: { id: "z" } }]).ok).toBe(false);
    expect(exec([{ op: "removeNode", nodeId: "n1" }]).ok).toBe(false);
    const whole = exec([{ op: "removeNode", nodeId: "t1" }, { op: "removeNode", nodeId: "n1" }, { op: "removeNode", nodeId: "n2" }]);
    expect(whole.ok).toBe(false);
    if (whole.ok) return;
    expect(whole.blocks?.map((b) => b.code)).toEqual(expect.arrayContaining(["DESTRUCTIVE_DELETION", "WHOLE_GRAPH_REPLACEMENT"]));
  });

  it("rejects a secret-like config write even when the caller's readiness says applyable", () => {
    const r = exec([{ op: "updateNodeConfig", nodeId: "n1", config: { apiKey: "x" } }]);
    expect(r).toMatchObject({ ok: false, code: "OPERATION_NOT_EXECUTABLE" });
    if (r.ok) return;
    expect(r.blocks?.map((b) => b.code)).toContain("SECRET_WRITE");
  });

  it("rejects a credential / provider-account mutation (defense-in-depth)", () => {
    const r = exec([{ op: "updateNodeConfig", nodeId: "n1", config: { accountId: "acct_2" } }]);
    expect(r).toMatchObject({ ok: false, code: "OPERATION_NOT_EXECUTABLE" });
    if (r.ok) return;
    expect(r.blocks?.map((b) => b.code)).toContain("CREDENTIAL_OR_ACCOUNT_MUTATION");
  });

  it("rejects a recipient change without confirmation (defense-in-depth)", () => {
    const r = exec([{ op: "updateNodeConfig", nodeId: "n1", config: { to: "a@b.com" } }]);
    expect(r).toMatchObject({ ok: false, code: "OPERATION_NOT_EXECUTABLE" });
    if (r.ok) return;
    expect(r.blocks?.map((b) => b.code)).toContain("RECIPIENT_CHANGE");
  });

  it("reports EXECUTION_FAILED for a structural error (targets a missing node)", () => {
    const r = exec([{ op: "updateNodeConfig", nodeId: "ghost", config: { text: "x" } }]);
    expect(r).toMatchObject({ ok: false, code: "EXECUTION_FAILED" });
  });
});

describe("executeWorkflowPatch — purity, no-leak, validity", () => {
  it("does not mutate the input definition object", () => {
    const def = baseDef();
    const snapshot = JSON.parse(JSON.stringify(def));
    executeWorkflowPatch(def as never, [{ op: "updateNodeConfig", nodeId: "n1", config: { text: "changed" } }] as PatchOperation[], okReadiness());
    expect(def).toEqual(snapshot);
  });

  it("the execution summary serializes no config VALUE", () => {
    const r = exec([{ op: "updateNodeConfig", nodeId: "n1", config: { text: "SECRET_VALUE_X" } }]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const summaryJson = JSON.stringify({ appliedOperations: r.appliedOperations, beforeHash: r.beforeHash, afterHash: r.afterHash });
    expect(summaryJson).not.toContain("SECRET_VALUE_X");
    expect(summaryJson).toContain("text"); // the non-secret KEY is fine
  });

  it("the resulting definition passes WorkflowDefinitionSchema", () => {
    const r = exec([{ op: "updateNodeConfig", nodeId: "n1", config: { text: "valid" } }]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(WorkflowDefinitionSchema.safeParse(r.updatedDefinition).success).toBe(true);
  });

  it("before/after hashes differ on a change and match on a no-op-equivalent", () => {
    const r = exec([{ op: "updateNodeConfig", nodeId: "n1", config: { text: "different" } }]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.beforeHash).not.toBe(r.afterHash);
    const same = exec([{ op: "updateNodeConfig", nodeId: "n1", config: { text: "hi" } }]); // same value already present
    expect(same.ok).toBe(true);
    if (!same.ok) return;
    expect(same.beforeHash).toBe(same.afterHash);
  });
});

describe("executeWorkflowPatch — import boundary", () => {
  it("imports NO repository / supabase / save / run / activation path", () => {
    const src = readFileSync(resolve(process.cwd(), "services/workflows/patch/executeWorkflowPatch.ts"), "utf8");
    const importSpec = /(?:import\s[^"']*?from\s*|import\s*|require\s*\(\s*)["']([^"']+)["']/g;
    const specifiers = [...src.matchAll(importSpec)].map((m) => m[1] ?? "");
    expect(specifiers.length).toBeGreaterThan(0);
    for (const spec of specifiers) {
      expect(spec).not.toMatch(/repositories\/|supabase|saveDraftDefinition|updateDraftDefinition|lifecycle|execution\/engine|runWorkflow/i);
    }
  });
});
