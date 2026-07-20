/**
 * @jest-environment node
 *
 * Tests for the pure, atomic patch application (Slice 4.AI-3).
 */

import type { WorkflowDefinition, WorkflowNode } from "@/contracts/workflowDefinition";
import { applyPatchToDefinition } from "@/services/workflows/patch/applyPatchToDefinition";

function node(id: string, kind: "trigger" | "action", provider: string, type: string, config: Record<string, unknown> = {}): WorkflowNode {
  return { id, kind, provider, type, config, position: { x: 0, y: 0 } };
}

const base: WorkflowDefinition = {
  nodes: [
    node("t", "trigger", "native", "manual.run"),
    node("a1", "action", "gmail", "send_email", { to: "x@y.com" }),
  ],
  edges: [{ id: "e1", from: "t", to: "a1" }],
};

describe("applyPatchToDefinition", () => {
  it("addNode appends without mutating the input", () => {
    const snapshot = JSON.stringify(base);
    const res = applyPatchToDefinition(base, [
      { op: "addNode", node: node("a2", "action", "slack", "send_channel_message") },
    ]);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.definition.nodes.map((n) => n.id)).toEqual(["t", "a1", "a2"]);
    expect(JSON.stringify(base)).toBe(snapshot); // input untouched
  });

  it("updateNodeConfig shallow-merges by default and replaces when replace=true", () => {
    const merged = applyPatchToDefinition(base, [
      { op: "updateNodeConfig", nodeId: "a1", config: { subject: "Hi" } },
    ]);
    expect(merged.ok && merged.definition.nodes[1]!.config).toEqual({ to: "x@y.com", subject: "Hi" });

    const replaced = applyPatchToDefinition(base, [
      { op: "updateNodeConfig", nodeId: "a1", config: { subject: "Hi" }, replace: true },
    ]);
    expect(replaced.ok && replaced.definition.nodes[1]!.config).toEqual({ subject: "Hi" });
  });

  it("removeNode cascades edge cleanup", () => {
    const res = applyPatchToDefinition(base, [{ op: "removeNode", nodeId: "a1" }]);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.definition.nodes.map((n) => n.id)).toEqual(["t"]);
    expect(res.definition.edges).toEqual([]); // e1 touched a1 → removed
  });

  it("addEdge / removeEdge / replaceEdge", () => {
    const added = applyPatchToDefinition(base, [
      { op: "addNode", node: node("a2", "action", "slack", "send_channel_message") },
      { op: "addEdge", edge: { id: "e2", from: "a1", to: "a2" } },
    ]);
    expect(added.ok && added.definition.edges.map((e) => e.id)).toEqual(["e1", "e2"]);

    const removed = applyPatchToDefinition(base, [{ op: "removeEdge", edgeId: "e1" }]);
    expect(removed.ok && removed.definition.edges).toEqual([]);

    const replaced = applyPatchToDefinition(base, [
      { op: "replaceEdge", edgeId: "e1", edge: { id: "e1", from: "t", to: "a1", label: "x" } },
    ]);
    expect(replaced.ok && replaced.definition.edges[0]!.label).toBe("x");
  });

  it("adding a SECOND incoming edge to an existing node preserves the first edge (reconvergence — RECONV-1 S3)", () => {
    const res = applyPatchToDefinition(base, [
      { op: "addNode", node: node("ifn", "action", "native", "if_then_condition") },
      { op: "addEdge", edge: { id: "e2", from: "ifn", to: "a1", label: "false" } },
    ]);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // Both incoming edges of a1 present; the pre-existing edge is untouched.
    expect(res.definition.edges).toEqual([
      { id: "e1", from: "t", to: "a1" },
      { id: "e2", from: "ifn", to: "a1", label: "false" },
    ]);
    // Untouched nodes preserved byte-for-byte.
    expect(JSON.stringify(res.definition.nodes.slice(0, 2))).toBe(JSON.stringify(base.nodes));
  });

  it("moveNode updates only position", () => {
    const res = applyPatchToDefinition(base, [
      { op: "moveNode", nodeId: "a1", position: { x: 99, y: 42 } },
    ]);
    expect(res.ok && res.definition.nodes[1]!.position).toEqual({ x: 99, y: 42 });
  });

  it("repairVariableReference sets the field", () => {
    const res = applyPatchToDefinition(base, [
      { op: "repairVariableReference", nodeId: "a1", fieldPath: "to", newReference: "{{trigger.from}}" },
    ]);
    expect(res.ok && res.definition.nodes[1]!.config.to).toBe("{{trigger.from}}");
  });

  it("replaceTrigger swaps the trigger and re-points its outgoing edges", () => {
    const res = applyPatchToDefinition(base, [
      { op: "replaceTrigger", node: node("t2", "trigger", "gmail", "new_email") },
    ]);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.definition.nodes.filter((n) => n.kind === "trigger").map((n) => n.id)).toEqual(["t2"]);
    // e1 was t→a1; re-pointed to t2→a1.
    expect(res.definition.edges[0]).toMatchObject({ from: "t2", to: "a1" });
  });

  it("aborts atomically with a typed error on an unapplicable op", () => {
    const res = applyPatchToDefinition(base, [
      { op: "updateNodeConfig", nodeId: "a1", config: { subject: "Hi" } },
      { op: "removeNode", nodeId: "ghost" },
    ]);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors[0]!.code).toBe("UNKNOWN_NODE");
    // Atomic: input never changed despite the first op being applicable.
    expect(base.nodes[1]!.config).toEqual({ to: "x@y.com" });
  });

  it("rejects replaceTrigger whose node is not a trigger", () => {
    const res = applyPatchToDefinition(base, [
      { op: "replaceTrigger", node: node("t2", "action", "gmail", "send_email") },
    ]);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors[0]!.code).toBe("INVALID_PATCH");
  });
});
