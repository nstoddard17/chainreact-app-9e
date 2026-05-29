/**
 * @jest-environment node
 *
 * Tests for services/ai/patch/normalizeAiPatchNodeKeys
 * (Slice 4.PROVIDER-CATALOG-INTEGRITY-1).
 *
 * The planner sometimes emits a self-qualified node — `{ provider:"gmail",
 * type:"gmail:new_email" }` — which the validator turns into the malformed
 * lookup key `gmail:gmail:new_email`. This pass strips a redundant `<provider>:`
 * prefix from `type` so a SUPPORTED node resolves; it is strict (only strips a
 * prefix equal to the node's own provider) so it never masks a real mismatch.
 */
import { normalizeAiPatchNodeKeys } from "@/services/ai/patch/normalizeAiPatchNodeKeys";
import type { WorkflowNode } from "@/contracts/workflowDefinition";
import type { PatchOperation, WorkflowPatch } from "@/services/workflows/patch/types";

function node(
  id: string,
  kind: "trigger" | "action",
  provider: string,
  type: string,
): WorkflowNode {
  return { id, kind, provider, type, config: {}, position: { x: 0, y: 0 } };
}

function patch(operations: PatchOperation[]): WorkflowPatch {
  return { patchId: "p1", workflowId: "wf1", baseRevision: "rev-1", operations, summary: "s", rationale: "r" };
}

function nodeOf(op: PatchOperation): WorkflowNode | undefined {
  return op.op === "addNode" || op.op === "replaceTrigger" ? op.node : undefined;
}

describe("normalizeAiPatchNodeKeys", () => {
  it("strips a redundant self-prefix from an addNode type", () => {
    const out = normalizeAiPatchNodeKeys(
      patch([{ op: "addNode", node: node("a", "action", "slack", "slack:send_channel_message") }]),
    );
    expect(nodeOf(out.operations[0]!)!.type).toBe("send_channel_message");
    expect(nodeOf(out.operations[0]!)!.provider).toBe("slack");
  });

  it("strips a redundant self-prefix from a replaceTrigger type (the live gmail case)", () => {
    const out = normalizeAiPatchNodeKeys(
      patch([{ op: "replaceTrigger", node: node("t", "trigger", "gmail", "gmail:new_email") }]),
    );
    expect(nodeOf(out.operations[0]!)!.type).toBe("new_email");
  });

  it("leaves a clean type untouched (same reference)", () => {
    const input = patch([{ op: "addNode", node: node("a", "action", "gmail", "send_email") }]);
    expect(normalizeAiPatchNodeKeys(input)).toBe(input);
  });

  it("leaves a MISMATCHED prefix intact (does not mask a real mismatch)", () => {
    const out = normalizeAiPatchNodeKeys(
      patch([{ op: "addNode", node: node("a", "action", "gmail", "outlook:send_email") }]),
    );
    expect(nodeOf(out.operations[0]!)!.type).toBe("outlook:send_email");
  });

  it("leaves a native dotted type untouched", () => {
    const out = normalizeAiPatchNodeKeys(
      patch([{ op: "replaceTrigger", node: node("t", "trigger", "native", "manual.run") }]),
    );
    expect(nodeOf(out.operations[0]!)!.type).toBe("manual.run");
  });

  it("does not touch non-node ops (updateNodeConfig / addEdge)", () => {
    const input = patch([
      { op: "updateNodeConfig", nodeId: "a", config: { x: 1 } },
      { op: "addEdge", edge: { id: "e", from: "t", to: "a" } },
    ]);
    expect(normalizeAiPatchNodeKeys(input)).toBe(input);
  });
});
