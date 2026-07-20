/**
 * @jest-environment node
 *
 * Slice 4.AI-35G — deterministic vertical layout for AI-applied simple linear
 * workflows. Pure graph operation (no registry / I/O), so these tests construct
 * definitions + patch operations directly.
 */
import {
  normalizeLinearWorkflowLayout,
  VERTICAL_NODE_SPACING,
} from "@/services/ai/apply/normalizeLinearLayout";
import type { WorkflowDefinition } from "@/contracts/workflowDefinition";
import type { PatchOperation } from "@/services/workflows/patch/types";

function node(id: string, kind: "trigger" | "action", x: number, y: number): WorkflowDefinition["nodes"][number] {
  return { id, kind, provider: "p", type: "t", config: {}, position: { x, y } };
}
function edge(id: string, from: string, to: string, label?: string): WorkflowDefinition["edges"][number] {
  return label ? { id, from, to, label } : { id, from, to };
}
const addNodeOp: PatchOperation = {
  op: "addNode",
  node: { id: "x", kind: "action", provider: "p", type: "t", config: {}, position: { x: 0, y: 0 } },
};

describe("normalizeLinearWorkflowLayout — simple linear chains", () => {
  it("stacks trigger above action (side-by-side → vertical)", () => {
    const def: WorkflowDefinition = {
      nodes: [node("t", "trigger", 0, 0), node("a", "action", 400, 0)], // side-by-side
      edges: [edge("e1", "t", "a")],
    };
    const out = normalizeLinearWorkflowLayout(def, [addNodeOp]);
    const t = out.nodes.find((n) => n.id === "t")!;
    const a = out.nodes.find((n) => n.id === "a")!;
    expect(t.position).toEqual({ x: 0, y: 0 });
    expect(a.position).toEqual({ x: 0, y: VERTICAL_NODE_SPACING });
    expect(a.position.y).toBeGreaterThan(t.position.y); // trigger above action
    expect(a.position.x).toBe(t.position.x); // x aligned
  });

  it("stacks trigger → action → action vertically in edge order", () => {
    const def: WorkflowDefinition = {
      nodes: [node("t", "trigger", 0, 0), node("a1", "action", 100, 50), node("a2", "action", 900, 7)],
      edges: [edge("e1", "t", "a1"), edge("e2", "a1", "a2")],
    };
    const out = normalizeLinearWorkflowLayout(def, [addNodeOp]);
    const y = (id: string) => out.nodes.find((n) => n.id === id)!.position.y;
    const x = (id: string) => out.nodes.find((n) => n.id === id)!.position.x;
    expect(y("t")).toBe(0);
    expect(y("a1")).toBe(VERTICAL_NODE_SPACING);
    expect(y("a2")).toBe(2 * VERTICAL_NODE_SPACING);
    expect(new Set([x("t"), x("a1"), x("a2")]).size).toBe(1); // all aligned
  });

  it("anchors on the head node's current position (keeps the graph where it is)", () => {
    const def: WorkflowDefinition = {
      nodes: [node("t", "trigger", 500, 300), node("a", "action", 999, 999)],
      edges: [edge("e1", "t", "a")],
    };
    const out = normalizeLinearWorkflowLayout(def, [addNodeOp]);
    expect(out.nodes.find((n) => n.id === "t")!.position).toEqual({ x: 500, y: 300 });
    expect(out.nodes.find((n) => n.id === "a")!.position).toEqual({ x: 500, y: 300 + VERTICAL_NODE_SPACING });
  });

  it("is idempotent on an already-vertical chain", () => {
    const def: WorkflowDefinition = {
      nodes: [node("t", "trigger", 0, 0), node("a", "action", 0, VERTICAL_NODE_SPACING)],
      edges: [edge("e1", "t", "a")],
    };
    const out = normalizeLinearWorkflowLayout(def, [addNodeOp]);
    expect(out.nodes).toEqual(def.nodes);
  });
});

describe("normalizeLinearWorkflowLayout — guards (no relayout)", () => {
  it("does NOT relayout when the patch has no structural add (pure config edit)", () => {
    const def: WorkflowDefinition = {
      nodes: [node("t", "trigger", 0, 0), node("a", "action", 400, 0)],
      edges: [edge("e1", "t", "a")],
    };
    const ops: PatchOperation[] = [{ op: "updateNodeConfig", nodeId: "a", config: { x: 1 } }];
    expect(normalizeLinearWorkflowLayout(def, ops).nodes).toEqual(def.nodes);
  });

  it("does NOT relayout when the patch contains an explicit moveNode", () => {
    const def: WorkflowDefinition = {
      nodes: [node("t", "trigger", 0, 0), node("a", "action", 400, 0)],
      edges: [edge("e1", "t", "a")],
    };
    const ops: PatchOperation[] = [addNodeOp, { op: "moveNode", nodeId: "a", position: { x: 9, y: 9 } }];
    expect(normalizeLinearWorkflowLayout(def, ops).nodes).toEqual(def.nodes);
  });

  it("does NOT relayout a branching graph (fan-out)", () => {
    const def: WorkflowDefinition = {
      nodes: [node("t", "trigger", 0, 0), node("a", "action", 0, 120), node("b", "action", 300, 120)],
      edges: [edge("e1", "t", "a"), edge("e2", "t", "b")], // t fans out to a + b
    };
    expect(normalizeLinearWorkflowLayout(def, [addNodeOp]).nodes).toEqual(def.nodes);
  });

  it("does NOT relayout when edges carry branch labels (router construct)", () => {
    const def: WorkflowDefinition = {
      nodes: [node("r", "action", 0, 0), node("a", "action", 400, 0)],
      edges: [edge("e1", "r", "a", "yes")],
    };
    expect(normalizeLinearWorkflowLayout(def, [addNodeOp]).nodes).toEqual(def.nodes);
  });

  it("does NOT relayout a fan-in graph (two nodes converge on one — RECONV-1 reconvergence)", () => {
    const def: WorkflowDefinition = {
      nodes: [node("a", "action", 0, 0), node("b", "action", 300, 0), node("m", "action", 150, 240)],
      edges: [edge("e1", "a", "m"), edge("e2", "b", "m")], // m has in-degree 2 (merge)
    };
    expect(normalizeLinearWorkflowLayout(def, [addNodeOp]).nodes).toEqual(def.nodes);
  });

  it("does NOT relayout a disconnected graph (more than one head)", () => {
    const def: WorkflowDefinition = {
      nodes: [node("t", "trigger", 0, 0), node("a", "action", 0, 120), node("orphan", "action", 700, 700)],
      edges: [edge("e1", "t", "a")], // 'orphan' has no edges → 2 heads
    };
    expect(normalizeLinearWorkflowLayout(def, [addNodeOp]).nodes).toEqual(def.nodes);
  });
});
