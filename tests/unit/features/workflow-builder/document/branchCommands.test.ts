/** @jest-environment node */
/**
 * Document BRANCH-authoring command boundary (5.DUAL-BUILDER-1 / CS-5).
 *
 * Proves every branch command is a thin composition over the EXISTING canonical
 * graphSlice/configSlice actions, returns a typed result (never throws into a
 * component), refuses stale/ambiguous/over-deep/unentitled gestures WITHOUT
 * mutating, and produces the canonical `edge.label` topology the engine reads —
 * no Document-specific branch schema, route model, or save path.
 */
import type { ActionMeta } from "@/contracts/actionMeta";
import type { WorkflowDefinition, WorkflowNode } from "@/contracts/workflow";
import {
  addDocumentActionToEmptyLane,
  addDocumentBranchRoute,
  createDocumentIfThenBranch,
  createDocumentRouterBranch,
  removeDocumentBranchRoute,
  renameDocumentBranchRoute,
  resolveDocumentSiblingLane,
  updateDocumentIfThenCondition,
  type DocumentBranchRefusal,
} from "@/features/workflow-builder/document/documentBranchCommands";
import { returnableBranchLabels } from "@/core/workflows/branchWiring";
import { useConfigSlice } from "@/features/workflow-builder/state/configSlice";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";

function clone(def: WorkflowDefinition): WorkflowDefinition {
  return JSON.parse(JSON.stringify(def)) as WorkflowDefinition;
}
function nodes(): readonly WorkflowNode[] {
  return useGraphSlice.getState().pendingNodes;
}
function edges() {
  return useGraphSlice.getState().pendingEdges;
}
function ifThenNode(): WorkflowNode | undefined {
  return nodes().find((n) => n.provider === "native" && n.type === "if_then_condition");
}
function routerNode(): WorkflowNode | undefined {
  return nodes().find((n) => n.provider === "native" && n.type === "router");
}
function labelsFrom(nodeId: string): (string | undefined)[] {
  return edges().filter((e) => e.from === nodeId).map((e) => e.label);
}

const linear: WorkflowDefinition = {
  nodes: [
    { id: "t", kind: "trigger", provider: "hubspot", type: "new_contact", config: {}, position: { x: 0, y: 0 } },
    { id: "a", kind: "action", provider: "slack", type: "send_channel_message", config: { text: "hi" }, position: { x: 0, y: 120 } },
    { id: "b", kind: "action", provider: "slack", type: "send_channel_message", config: {}, position: { x: 0, y: 240 } },
  ],
  edges: [
    { id: "e1", from: "t", to: "a" },
    { id: "e2", from: "a", to: "b" },
  ],
};

function routerWorkflow(): WorkflowDefinition {
  return {
    nodes: [
      { id: "t", kind: "trigger", provider: "hubspot", type: "new_contact", config: {}, position: { x: 0, y: 0 } },
      {
        id: "r",
        kind: "action",
        provider: "native",
        type: "router",
        config: {
          routes: [
            { label: "hot", condition: { input: "{{t.score}}", operator: "greater_than", value: "80" } },
            { label: "cold", condition: { input: "{{t.score}}", operator: "less_than", value: "20" } },
          ],
        },
        position: { x: 0, y: 120 },
      },
      { id: "h", kind: "action", provider: "slack", type: "send_channel_message", config: { text: "hot" }, position: { x: -160, y: 240 } },
      { id: "c", kind: "action", provider: "slack", type: "send_channel_message", config: { text: "cold" }, position: { x: 160, y: 240 } },
    ],
    edges: [
      { id: "e1", from: "t", to: "r" },
      { id: "e2", from: "r", to: "h", label: "hot" },
      { id: "e3", from: "r", to: "c", label: "cold" },
    ],
  };
}

beforeEach(() => {
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
});

// ---------------------------------------------------------------------------
describe("createDocumentIfThenBranch", () => {
  it("adds an If/Then at a linear tail with canonical true/false labels", () => {
    useGraphSlice.getState().hydrate("wf", clone(linear));
    const res = createDocumentIfThenBranch({ location: { kind: "tail", anchorNodeId: "b" } });
    expect(res.ok).toBe(true);
    const ifNode = ifThenNode()!;
    expect(ifNode).toBeDefined();
    expect(ifNode.config.onFalse).toBe("branch"); // seeded default
    // Entry edge b -> IF, both lanes initially unwired (missing warnings, ok).
    expect(edges().some((e) => e.from === "b" && e.to === ifNode.id && e.label === undefined)).toBe(true);
    expect(returnableBranchLabels(ifNode)).toEqual(["true", "false"]);
    expect(labelsFrom(ifNode.id)).toEqual([]); // no lane wired yet
  });

  it("inserts an If/Then between two linear nodes, wiring true+false to the preserved downstream (rejoin)", () => {
    useGraphSlice.getState().hydrate("wf", clone(linear));
    const res = createDocumentIfThenBranch({
      location: { kind: "between", edgeId: "e2", expectedFrom: "a", expectedTo: "b" },
    });
    expect(res.ok).toBe(true);
    const ifNode = ifThenNode()!;
    // a -> IF unlabeled; IF --true--> b and IF --false--> b (b = single rejoin).
    expect(edges().some((e) => e.from === "a" && e.to === ifNode.id && e.label === undefined)).toBe(true);
    const toB = edges().filter((e) => e.from === ifNode.id && e.to === "b").map((e) => e.label).sort();
    expect(toB).toEqual(["false", "true"]);
    // Original a->b edge is gone (replaced).
    expect(edges().some((e) => e.from === "a" && e.to === "b")).toBe(false);
  });

  it("refuses a Free client gesture WITHOUT mutating", () => {
    useGraphSlice.getState().hydrate("wf", clone(linear));
    const before = JSON.stringify({ n: nodes(), e: edges() });
    const res = createDocumentIfThenBranch({
      location: { kind: "tail", anchorNodeId: "b" },
      canUseAdvancedBranching: false,
    });
    expect(res).toEqual({ ok: false, reason: "plan_feature_required" });
    expect(JSON.stringify({ n: nodes(), e: edges() })).toBe(before);
  });

  it("refuses an ambiguous / stale insertion WITHOUT mutating", () => {
    useGraphSlice.getState().hydrate("wf", clone(linear));
    const before = JSON.stringify({ n: nodes(), e: edges() });
    // 'a' is not a tail (it has an outgoing edge) → stale.
    const res = createDocumentIfThenBranch({ location: { kind: "tail", anchorNodeId: "a" } });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("stale_document_model");
    expect(JSON.stringify({ n: nodes(), e: edges() })).toBe(before);
  });
});

// ---------------------------------------------------------------------------
describe("nested If/Then creation + depth guard", () => {
  function nestTo(depth: number): string {
    // Build depth levels of nested If/Then via lane-start insertion, returning
    // the deepest lane's entry edge id.
    useGraphSlice.getState().hydrate("wf", clone(linear));
    // Level 0 fork between a->b.
    createDocumentIfThenBranch({ location: { kind: "between", edgeId: "e2", expectedFrom: "a", expectedTo: "b" } });
    let fork = ifThenNode()!;
    let entry = edges().find((e) => e.from === fork.id && e.label === "true")!;
    for (let d = 1; d < depth; d++) {
      const res = createDocumentIfThenBranch({
        location: {
          kind: "laneStart",
          edgeId: entry.id,
          expectedFrom: entry.from,
          expectedTo: entry.to,
          expectedLabel: "true",
        },
      });
      expect(res.ok).toBe(true);
      // The newest If/Then is the one on the true lane of the previous fork.
      const newFork = nodes().find(
        (n) => n.provider === "native" && n.type === "if_then_condition" && edges().some((e) => e.to === n.id && e.from === fork.id),
      )!;
      fork = newFork;
      entry = edges().find((e) => e.from === fork.id && e.label === "true")!;
    }
    return entry.id;
  }

  it("allows nesting up to depth 3 (three forks)", () => {
    nestTo(3);
    const forkCount = nodes().filter((n) => n.type === "if_then_condition").length;
    expect(forkCount).toBe(3);
  });

  it("refuses a 4th-level nested fork with nesting_depth_exceeded, no mutation", () => {
    const entry = nestTo(3);
    const e = edges().find((x) => x.id === entry)!;
    const before = JSON.stringify({ n: nodes(), e: edges() });
    const res = createDocumentIfThenBranch({
      location: { kind: "laneStart", edgeId: e.id, expectedFrom: e.from, expectedTo: e.to, expectedLabel: "true" },
    });
    expect(res).toEqual({ ok: false, reason: "nesting_depth_exceeded" });
    expect(JSON.stringify({ n: nodes(), e: edges() })).toBe(before);
  });
});

// ---------------------------------------------------------------------------
describe("createDocumentRouterBranch", () => {
  it("adds a Router at a linear tail (no routes yet) and returns its id", () => {
    useGraphSlice.getState().hydrate("wf", clone(linear));
    const res = createDocumentRouterBranch({ location: { kind: "tail", anchorNodeId: "b" } });
    expect(res.ok).toBe(true);
    const r = routerNode()!;
    if (res.ok) expect(res.nodeId).toBe(r.id);
    expect(returnableBranchLabels(r)).toBeNull(); // no routes → not yet returnable
    expect(edges().some((e) => e.from === "b" && e.to === r.id && e.label === undefined)).toBe(true);
  });

  // CS-6 LOCKED DECISION — a Router may NOT be inserted between A → B (it would
  // leave B as a misleading unlabeled always-run continuation). Only a true tail
  // (or an empty lane via addDocumentActionToEmptyLane) is allowed.
  it("REFUSES a Router between two linear nodes WITHOUT mutating", () => {
    useGraphSlice.getState().hydrate("wf", clone(linear));
    const before = JSON.stringify({ n: nodes(), e: edges() });
    const res = createDocumentRouterBranch({
      location: { kind: "between", edgeId: "e2", expectedFrom: "a", expectedTo: "b" },
    });
    expect(res).toEqual({ ok: false, reason: "router_between_unsupported" });
    expect(routerNode()).toBeUndefined();
    expect(JSON.stringify({ n: nodes(), e: edges() })).toBe(before);
  });

  it("REFUSES a Router at a branch-lane start (would preserve a misleading continuation)", () => {
    useGraphSlice.getState().hydrate("wf", routerWorkflow());
    const before = JSON.stringify({ n: nodes(), e: edges() });
    // The 'hot' lane entry edge (r --hot--> h) has a downstream node 'h'.
    const laneEdge = edges().find((e) => e.from === "r" && e.label === "hot")!;
    const res = createDocumentRouterBranch({
      location: { kind: "laneStart", edgeId: laneEdge.id, expectedFrom: "r", expectedTo: "h", expectedLabel: "hot" },
    });
    expect(res).toEqual({ ok: false, reason: "router_between_unsupported" });
    expect(JSON.stringify({ n: nodes(), e: edges() })).toBe(before);
  });
});

// ---------------------------------------------------------------------------
describe("updateDocumentIfThenCondition", () => {
  function withIfThen(onFalse: "branch" | "skip"): void {
    useGraphSlice.getState().hydrate("wf", {
      nodes: [
        { id: "t", kind: "trigger", provider: "hubspot", type: "new_contact", config: {}, position: { x: 0, y: 0 } },
        { id: "if", kind: "action", provider: "native", type: "if_then_condition", config: { input: "x", operator: "equals", value: "1", onFalse }, position: { x: 0, y: 120 } },
        { id: "yes", kind: "action", provider: "slack", type: "send_channel_message", config: {}, position: { x: -100, y: 240 } },
        { id: "no", kind: "action", provider: "slack", type: "send_channel_message", config: {}, position: { x: 100, y: 240 } },
      ],
      // In skip mode a False lane is not returnable — no false edge exists.
      edges: [
        { id: "e1", from: "t", to: "if" },
        { id: "e2", from: "if", to: "yes", label: "true" },
        ...(onFalse === "branch" ? [{ id: "e3", from: "if", to: "no", label: "false" }] : []),
      ],
    });
  }

  it("edits input/operator/value through the canonical config path", () => {
    withIfThen("branch");
    const res = updateDocumentIfThenCondition({ nodeId: "if", patch: { operator: "greater_than", value: "5" } });
    expect(res.ok).toBe(true);
    const cfg = ifThenNode()!.config;
    expect(cfg.operator).toBe("greater_than");
    expect(cfg.value).toBe("5");
    expect(cfg.input).toBe("x"); // untouched
  });

  it("onFalse branch→skip reconciles (drops) the now-unreturnable false edge", () => {
    withIfThen("branch");
    expect(edges().some((e) => e.from === "if" && e.label === "false")).toBe(true);
    const res = updateDocumentIfThenCondition({ nodeId: "if", patch: { onFalse: "skip" } });
    expect(res.ok).toBe(true);
    expect(returnableBranchLabels(ifThenNode()!)).toEqual(["true"]);
    expect(edges().some((e) => e.from === "if" && e.label === "false")).toBe(false);
    // The 'no' node stays in the graph (surfaced by validation, not deleted).
    expect(nodes().some((n) => n.id === "no")).toBe(true);
  });

  it("onFalse skip→branch re-exposes an unwired false lane (missing_branch_edge)", () => {
    withIfThen("skip");
    // In skip mode there is no false edge.
    expect(edges().some((e) => e.from === "if" && e.label === "false")).toBe(false);
    const res = updateDocumentIfThenCondition({ nodeId: "if", patch: { onFalse: "branch" } });
    expect(res.ok).toBe(true);
    expect(returnableBranchLabels(ifThenNode()!)).toEqual(["true", "false"]);
    // false is returnable but has no edge → the validation layer flags missing.
    expect(edges().some((e) => e.from === "if" && e.label === "false")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe("Router route add / remove / rename", () => {
  it("adds a route; the new label is immediately returnable", () => {
    useGraphSlice.getState().hydrate("wf", routerWorkflow());
    const res = addDocumentBranchRoute({
      nodeId: "r",
      label: "warm",
      condition: { input: "{{t.score}}", operator: "greater_than", value: "40" },
    });
    expect(res.ok).toBe(true);
    expect(returnableBranchLabels(routerNode()!)).toEqual(["hot", "cold", "warm"]);
  });

  it("refuses a duplicate route label WITHOUT mutating", () => {
    useGraphSlice.getState().hydrate("wf", routerWorkflow());
    const before = JSON.stringify(routerNode()!.config);
    const res = addDocumentBranchRoute({ nodeId: "r", label: "hot" });
    expect(res).toEqual({ ok: false, reason: "duplicate_route_label" });
    expect(JSON.stringify(routerNode()!.config)).toBe(before);
  });

  it("removes a leaf-only route only after confirmation; safe default keeps the node", () => {
    useGraphSlice.getState().hydrate("wf", routerWorkflow());
    // 'c' (cold destination) is reachable ONLY via the 'cold' lane → confirmation required.
    const first = removeDocumentBranchRoute({ nodeId: "r", label: "cold" });
    expect(first).toEqual({ ok: false, reason: "destructive_confirmation_required" });
    expect(edges().some((e) => e.from === "r" && e.label === "cold")).toBe(true);

    const confirmed = removeDocumentBranchRoute({ nodeId: "r", label: "cold", confirmed: true });
    expect(confirmed.ok).toBe(true);
    expect(returnableBranchLabels(routerNode()!)).toEqual(["hot"]);
    // The labeled edge is detached, but the downstream node stays (validation surfaces it).
    expect(edges().some((e) => e.from === "r" && e.label === "cold")).toBe(false);
    expect(nodes().some((n) => n.id === "c")).toBe(true);
  });

  it("renames a route preserving its wired edge (approach 2)", () => {
    useGraphSlice.getState().hydrate("wf", routerWorkflow());
    const res = renameDocumentBranchRoute({ nodeId: "r", oldLabel: "hot", newLabel: "priority" });
    expect(res.ok).toBe(true);
    expect(returnableBranchLabels(routerNode()!)).toEqual(["priority", "cold"]);
    // The edge to 'h' is preserved, relabeled hot → priority (no missing lane).
    const toH = edges().find((e) => e.from === "r" && e.to === "h");
    expect(toH?.label).toBe("priority");
    expect(edges().some((e) => e.from === "r" && e.label === "hot")).toBe(false);
  });

  it("refuses renaming to a duplicate label WITHOUT mutating", () => {
    useGraphSlice.getState().hydrate("wf", routerWorkflow());
    const before = JSON.stringify({ n: nodes(), e: edges() });
    const res = renameDocumentBranchRoute({ nodeId: "r", oldLabel: "hot", newLabel: "cold" });
    expect(res).toEqual({ ok: false, reason: "duplicate_route_label" });
    expect(JSON.stringify({ n: nodes(), e: edges() })).toBe(before);
  });

  it("refuses renaming a stale (non-existent) route label", () => {
    useGraphSlice.getState().hydrate("wf", routerWorkflow());
    const res = renameDocumentBranchRoute({ nodeId: "r", oldLabel: "nope", newLabel: "x" });
    expect(res).toEqual({ ok: false, reason: "stale_route_label" });
  });
});

// ---------------------------------------------------------------------------
describe("addDocumentActionToEmptyLane", () => {
  const actionMeta: ActionMeta = {
    key: "slack:send_channel_message",
    provider: "slack",
    type: "send_channel_message",
    displayName: "Send message",
    description: "",
    category: "messaging",
    requiresIntegration: true,
    fields: [],
    outputs: [],
    producesFileRef: false,
    consumesFileRef: false,
    displayOrder: 1,
    isDestructive: false,
    requiresConfirmation: false,
    riskLevel: "low",
  };

  it("wires a new action into an empty (missing) lane with the route label", () => {
    useGraphSlice.getState().hydrate("wf", {
      nodes: [
        { id: "t", kind: "trigger", provider: "hubspot", type: "new_contact", config: {}, position: { x: 0, y: 0 } },
        { id: "if", kind: "action", provider: "native", type: "if_then_condition", config: { input: "x", operator: "equals", value: "1", onFalse: "branch" }, position: { x: 0, y: 120 } },
        { id: "yes", kind: "action", provider: "slack", type: "send_channel_message", config: {}, position: { x: 0, y: 240 } },
      ],
      edges: [
        { id: "e1", from: "t", to: "if" },
        { id: "e2", from: "if", to: "yes", label: "true" },
        // 'false' lane is EMPTY (missing_branch_edge).
      ],
    });
    const res = addDocumentActionToEmptyLane({ forkNodeId: "if", label: "false", meta: actionMeta });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(edges().some((e) => e.from === "if" && e.to === res.nodeId && e.label === "false")).toBe(true);
      // No stray unlabeled fork->node edge remains.
      expect(edges().some((e) => e.from === "if" && e.to === res.nodeId && e.label === undefined)).toBe(false);
    }
  });

  it("refuses when the lane already has a destination (ambiguous_lane)", () => {
    useGraphSlice.getState().hydrate("wf", routerWorkflow());
    const res = addDocumentActionToEmptyLane({ forkNodeId: "r", label: "hot", meta: actionMeta });
    expect(res).toEqual({ ok: false, reason: "ambiguous_lane" });
  });
});

// ---------------------------------------------------------------------------
describe("resolveDocumentSiblingLane (focus only, no mutation)", () => {
  it("returns the sibling lane's first node without changing topology", () => {
    useGraphSlice.getState().hydrate("wf", routerWorkflow());
    const before = JSON.stringify({ n: nodes(), e: edges() });
    const res = resolveDocumentSiblingLane({ fromNodeId: "h", targetLabel: "cold" });
    expect(res).toEqual({ ok: true, nodeId: "c" });
    expect(JSON.stringify({ n: nodes(), e: edges() })).toBe(before);
  });

  it("refuses an unknown sibling label", () => {
    useGraphSlice.getState().hydrate("wf", routerWorkflow());
    const res = resolveDocumentSiblingLane({ fromNodeId: "h", targetLabel: "nope" });
    expect(res).toEqual({ ok: false, reason: "ambiguous_lane" });
  });
});

// ---------------------------------------------------------------------------
describe("undo/redo participates in shared history", () => {
  it("create branch → undo removes it → redo restores it", () => {
    useGraphSlice.getState().hydrate("wf", clone(linear));
    createDocumentIfThenBranch({ location: { kind: "tail", anchorNodeId: "b" } });
    expect(ifThenNode()).toBeDefined();
    // Each connectNodes/add is captured; undo the whole gesture back to baseline.
    const g = useGraphSlice.getState();
    while (useGraphSlice.getState().past.length > 0 && ifThenNode()) g.undo();
    expect(ifThenNode()).toBeUndefined();
    // Redo replays forward.
    while (useGraphSlice.getState().future.length > 0 && !ifThenNode()) g.redo();
    expect(ifThenNode()).toBeDefined();
  });

  it("rename route → undo restores old label + edge", () => {
    useGraphSlice.getState().hydrate("wf", routerWorkflow());
    renameDocumentBranchRoute({ nodeId: "r", oldLabel: "hot", newLabel: "priority" });
    expect(edges().find((e) => e.to === "h")?.label).toBe("priority");
    useGraphSlice.getState().undo();
    expect(edges().find((e) => e.to === "h")?.label).toBe("hot");
    expect(returnableBranchLabels(routerNode()!)).toEqual(["hot", "cold"]);
  });
});

// Exhaustiveness: every documented refusal is a member of the union.
const _refusals: DocumentBranchRefusal[] = [
  "node_missing",
  "edge_missing",
  "no_draft",
  "stale_document_model",
  "invalid_branch_source",
  "invalid_route_config",
  "duplicate_route_label",
  "stale_route_label",
  "ambiguous_lane",
  "unsupported_region",
  "nesting_depth_exceeded",
  "plan_feature_required",
  "destructive_confirmation_required",
  "branching_not_supported_here",
];
void _refusals;
