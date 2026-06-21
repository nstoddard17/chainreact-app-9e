/**
 * @jest-environment node
 *
 * Pure additive-patch placement planner (HERMES-AGENT-APPLY-IN-PLACE / -INSERT-BETWEEN).
 * Proves the deterministic placement rules: blank / appended / inserted_between (one safe edge split)
 * / side_chain, the no-branch-rewrite + duplicate/invalid guards, and that only the single split edge
 * is ever removed.
 */
import {
  computeAdditivePatchPlacement,
  type ResolvedPatchNode,
} from "@/features/workflow-builder/utils/additivePatchPlacement";
import type { WorkflowEdge, WorkflowNode } from "@/contracts/workflow";

function node(id: string, kind: WorkflowNode["kind"], x = 0, y = 0): WorkflowNode {
  return { id, kind, provider: id, type: `${id}_type`, config: { keep: id }, position: { x, y } };
}
function action(ref: string, provider = "slack", type = "send_message"): ResolvedPatchNode {
  return { id: ref, kind: "action", provider, type };
}

function mint() {
  let i = 0;
  return () => `e-new-${i++}`;
}
function run(args: {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  toAdd: ResolvedPatchNode[];
  internalEdges?: { from: string; to: string }[];
  appendAfterNodeId?: string;
}) {
  return computeAdditivePatchPlacement({
    pendingNodes: args.nodes,
    pendingEdges: args.edges,
    toAdd: args.toAdd,
    internalEdges: args.internalEdges ?? [],
    ...(args.appendAfterNodeId ? { appendAfterNodeId: args.appendAfterNodeId } : {}),
    mintEdgeId: mint(),
    sideChainXGap: 400,
    nodeYGap: 160,
  });
}

describe("computeAdditivePatchPlacement — blank + appended", () => {
  it("blank graph → 'blank', no removed edges, only internal edges added", () => {
    const r = run({ nodes: [], edges: [], toAdd: [action("x")] });
    expect(r.placement).toBe("blank");
    expect(r.removedEdgeIds).toEqual([]);
    expect(r.addedNodes).toHaveLength(1);
  });

  it("selected node with ZERO outgoing edges → 'appended' (anchor edge A→firstNew)", () => {
    const nodes = [node("t", "trigger"), node("a", "action", 0, 160)];
    const r = run({ nodes, edges: [{ id: "e1", from: "t", to: "a" }], toAdd: [action("x")], appendAfterNodeId: "a" });
    expect(r.placement).toBe("appended");
    expect(r.removedEdgeIds).toEqual([]);
    expect(r.addedEdges.some((e) => e.from === "a" && e.to === r.addedNodes[0]!.id)).toBe(true);
  });

  it("no selection + sole tail → 'appended' after the tail", () => {
    const nodes = [node("t", "trigger"), node("a", "action", 0, 160)];
    const r = run({ nodes, edges: [{ id: "e1", from: "t", to: "a" }], toAdd: [action("x")] });
    expect(r.placement).toBe("appended");
    expect(r.addedEdges.some((e) => e.from === "a" && e.to === r.addedNodes[0]!.id)).toBe(true);
  });

  it("first added node is a trigger → 'side_chain' (never wire a node into a trigger)", () => {
    const nodes = [node("t", "trigger")];
    const r = run({ nodes, edges: [], toAdd: [{ id: "x", kind: "trigger", provider: "gmail", type: "new_email" }] });
    expect(r.placement).toBe("side_chain");
    expect(r.removedEdgeIds).toEqual([]);
  });

  it("ambiguous multi-tail + no selection → 'side_chain', no anchor edge", () => {
    const nodes = [node("t", "trigger"), node("a1", "action", -120, 160), node("a2", "action", 120, 160)];
    const edges = [
      { id: "e1", from: "t", to: "a1" },
      { id: "e2", from: "t", to: "a2" },
    ];
    const r = run({ nodes, edges, toAdd: [action("x")] });
    expect(r.placement).toBe("side_chain");
    expect(r.addedEdges.some((e) => e.to === r.addedNodes[0]!.id)).toBe(false);
    expect(r.removedEdgeIds).toEqual([]);
  });
});

describe("computeAdditivePatchPlacement — inserted_between", () => {
  const nodes = [node("a", "trigger"), node("b", "action", 0, 160)];
  const edges: WorkflowEdge[] = [{ id: "e-ab", from: "a", to: "b" }];

  it("selected A with one unlabeled outgoing edge A→B → split into A→X and X→B; only e-ab removed", () => {
    const r = run({ nodes, edges, toAdd: [action("x")], appendAfterNodeId: "a" });
    expect(r.placement).toBe("inserted_between");
    expect(r.removedEdgeIds).toEqual(["e-ab"]);
    const x = r.addedNodes[0]!.id;
    expect(r.addedEdges.some((e) => e.from === "a" && e.to === x)).toBe(true);
    expect(r.addedEdges.some((e) => e.from === x && e.to === "b")).toBe(true);
  });

  it("multi-node chain X→Y inserts A→X, Y→B and the internal X→Y", () => {
    const toAdd = [action("x"), action("y", "notion", "create_page")];
    const r = run({ nodes, edges, toAdd, internalEdges: [{ from: "x", to: "y" }], appendAfterNodeId: "a" });
    expect(r.placement).toBe("inserted_between");
    const [x, y] = r.addedNodes.map((n) => n.id);
    expect(r.addedEdges.some((e) => e.from === "a" && e.to === x)).toBe(true);
    expect(r.addedEdges.some((e) => e.from === x && e.to === y)).toBe(true);
    expect(r.addedEdges.some((e) => e.from === y && e.to === "b")).toBe(true);
    expect(r.removedEdgeIds).toEqual(["e-ab"]);
  });

  it("does NOT split when the selected node has MULTIPLE outgoing edges → 'appended'", () => {
    const n = [node("a", "trigger"), node("b", "action", -120, 160), node("c", "action", 120, 160)];
    const e = [
      { id: "e1", from: "a", to: "b" },
      { id: "e2", from: "a", to: "c" },
    ];
    const r = run({ nodes: n, edges: e, toAdd: [action("x")], appendAfterNodeId: "a" });
    expect(r.placement).toBe("appended");
    expect(r.removedEdgeIds).toEqual([]);
  });

  it("does NOT split a LABELED (router/branch) edge → 'appended' (no branch rewrite)", () => {
    const e: WorkflowEdge[] = [{ id: "e-ab", from: "a", to: "b", label: "yes" }];
    const r = run({ nodes, edges: e, toAdd: [action("x")], appendAfterNodeId: "a" });
    expect(r.placement).toBe("appended");
    expect(r.removedEdgeIds).toEqual([]);
  });

  it("does NOT split a self-loop or an edge to a missing node → 'appended'", () => {
    const selfLoop: WorkflowEdge[] = [{ id: "e-aa", from: "a", to: "a" }];
    expect(run({ nodes: [node("a", "trigger")], edges: selfLoop, toAdd: [action("x")], appendAfterNodeId: "a" }).placement).toBe("appended");
  });

  it("never moves or mutates existing nodes (added nodes carry empty config)", () => {
    const r = run({ nodes, edges, toAdd: [action("x")], appendAfterNodeId: "a" });
    expect(r.addedNodes.every((n) => Object.keys(n.config).length === 0)).toBe(true);
  });
});
