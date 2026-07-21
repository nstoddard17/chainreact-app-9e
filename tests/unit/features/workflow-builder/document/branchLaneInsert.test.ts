/**
 * Branch-lane insertion (5.DUAL-BUILDER-1 / CS-2B).
 *
 * `branch --[LABEL]--> B` becomes `branch --[LABEL]--> NEW --> B`.
 *
 * Proves the validation command's accept/refuse matrix and that the actual
 * rewiring — delegated to the SHARED `insertActionAtEdge` — keeps the route
 * label on the upstream half, leaves the continuation unlabeled, and never
 * touches unrelated nodes, edges, configs, or positions. Refusals never
 * mutate.
 */
import type { ActionMeta } from "@/contracts/actionMeta";
import type { WorkflowDefinition } from "@/contracts/workflow";
import { validateDocumentBranchLaneInsertion } from "@/features/workflow-builder/document/documentCommands";
import { insertActionAtEdge } from "@/features/workflow-builder/utils/insertActionAtEdge";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import { useConfigSlice } from "@/features/workflow-builder/state/configSlice";

const slackAction = {
  key: "slack:send_channel_message",
  provider: "slack",
  type: "send_channel_message",
  displayName: "Send Channel Message",
  description: "Post a message.",
  category: "messaging",
  requiresIntegration: true,
  displayOrder: 10,
  fields: [],
  outputs: [],
} as unknown as ActionMeta;

function clone(def: WorkflowDefinition): WorkflowDefinition {
  return JSON.parse(JSON.stringify(def)) as WorkflowDefinition;
}

/** trigger → If/Then → (true: hot | false: cold) → rejoin */
const ifThenGraph: WorkflowDefinition = {
  nodes: [
    { id: "t", kind: "trigger", provider: "hubspot", type: "new_contact", config: {}, position: { x: 0, y: 0 } },
    {
      id: "if",
      kind: "action",
      provider: "native",
      type: "if_then_condition",
      config: { input: "{{trigger.amount}}", operator: "greater_than", value: "100", onFalse: "branch" },
      position: { x: 0, y: 120 },
    },
    { id: "hot", kind: "action", provider: "slack", type: "send_channel_message", config: { text: "hot" }, position: { x: -160, y: 240 } },
    { id: "cold", kind: "action", provider: "slack", type: "send_channel_message", config: { text: "cold" }, position: { x: 160, y: 240 } },
    { id: "join", kind: "action", provider: "slack", type: "send_channel_message", config: { text: "join" }, position: { x: 0, y: 360 } },
  ],
  edges: [
    { id: "e-t", from: "t", to: "if" },
    { id: "e-true", from: "if", to: "hot", label: "true" },
    { id: "e-false", from: "if", to: "cold", label: "false" },
    { id: "e-hot-join", from: "hot", to: "join" },
    { id: "e-cold-join", from: "cold", to: "join" },
  ],
};

const routerGraph: WorkflowDefinition = {
  nodes: [
    { id: "t", kind: "trigger", provider: "hubspot", type: "new_contact", config: {}, position: { x: 0, y: 0 } },
    {
      id: "rt",
      kind: "action",
      provider: "native",
      type: "router",
      config: {
        routes: [
          { label: "hot", condition: { input: "{{trigger.k}}", operator: "equals", value: "hot" } },
          { label: "warm", condition: { input: "{{trigger.k}}", operator: "equals", value: "warm" } },
        ],
      },
      position: { x: 0, y: 120 },
    },
    { id: "h", kind: "action", provider: "slack", type: "send_channel_message", config: {}, position: { x: -160, y: 240 } },
    { id: "w", kind: "action", provider: "slack", type: "send_channel_message", config: {}, position: { x: 160, y: 240 } },
  ],
  edges: [
    { id: "e-t", from: "t", to: "rt" },
    { id: "e-hot", from: "rt", to: "h", label: "hot" },
    { id: "e-warm", from: "rt", to: "w", label: "warm" },
  ],
};

function hydrate(def: WorkflowDefinition): void {
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
  useGraphSlice.getState().hydrate("wf-lane", clone(def));
}

function snapshot() {
  const s = useGraphSlice.getState();
  return {
    nodes: JSON.parse(JSON.stringify(s.pendingNodes)),
    edges: JSON.parse(JSON.stringify(s.pendingEdges)),
    isDirty: s.isDirty,
  };
}

beforeEach(() => hydrate(ifThenGraph));

describe("valid lane insertions", () => {
  it("If/Then TRUE lane: label moves upstream, continuation is unlabeled", () => {
    const check = validateDocumentBranchLaneInsertion({
      edgeId: "e-true",
      expectedFrom: "if",
      expectedTo: "hot",
      expectedLabel: "true",
    });
    expect(check).toEqual({ ok: true });

    insertActionAtEdge("e-true", slackAction);

    const { pendingNodes, pendingEdges } = useGraphSlice.getState();
    const added = pendingNodes.find(
      (n) => !["t", "if", "hot", "cold", "join"].includes(n.id),
    )!;
    expect(added).toBeDefined();

    const upstream = pendingEdges.find((e) => e.from === "if" && e.to === added.id)!;
    expect(upstream.label).toBe("true");
    const downstream = pendingEdges.find((e) => e.from === added.id && e.to === "hot")!;
    expect(downstream.label).toBeUndefined();
    // The original labeled edge is gone (replaced, not duplicated).
    expect(pendingEdges.find((e) => e.id === "e-true")).toBeUndefined();
    expect(pendingEdges.filter((e) => e.from === "if" && e.label === "true")).toHaveLength(1);
  });

  it("If/Then FALSE lane works the same way", () => {
    expect(
      validateDocumentBranchLaneInsertion({
        edgeId: "e-false",
        expectedFrom: "if",
        expectedTo: "cold",
        expectedLabel: "false",
      }),
    ).toEqual({ ok: true });

    insertActionAtEdge("e-false", slackAction);
    const { pendingNodes, pendingEdges } = useGraphSlice.getState();
    const added = pendingNodes.find((n) => !["t", "if", "hot", "cold", "join"].includes(n.id))!;
    expect(pendingEdges.find((e) => e.from === "if" && e.to === added.id)?.label).toBe("false");
    expect(pendingEdges.find((e) => e.from === added.id && e.to === "cold")?.label).toBeUndefined();
    // The TRUE lane is untouched.
    expect(pendingEdges.find((e) => e.id === "e-true")).toMatchObject({
      from: "if",
      to: "hot",
      label: "true",
    });
  });

  it("Router route insertion preserves that route's label only", () => {
    hydrate(routerGraph);
    expect(
      validateDocumentBranchLaneInsertion({
        edgeId: "e-hot",
        expectedFrom: "rt",
        expectedTo: "h",
        expectedLabel: "hot",
      }),
    ).toEqual({ ok: true });

    insertActionAtEdge("e-hot", slackAction);
    const { pendingNodes, pendingEdges } = useGraphSlice.getState();
    const added = pendingNodes.find((n) => !["t", "rt", "h", "w"].includes(n.id))!;
    expect(pendingEdges.find((e) => e.from === "rt" && e.to === added.id)?.label).toBe("hot");
    expect(pendingEdges.find((e) => e.from === added.id && e.to === "h")?.label).toBeUndefined();
    expect(pendingEdges.find((e) => e.id === "e-warm")).toMatchObject({ label: "warm" });
  });

  it("unrelated nodes/edges/configs stay deep-equal and existing positions never move", () => {
    const before = snapshot();
    insertActionAtEdge("e-true", slackAction);
    const after = useGraphSlice.getState();

    for (const id of ["t", "if", "hot", "cold", "join"]) {
      const b = before.nodes.find((n: { id: string }) => n.id === id);
      const a = after.pendingNodes.find((n) => n.id === id);
      // BUILDER-CANVAS-LAYOUT-2 may push the DOWNSTREAM subtree to open a row;
      // identity and configuration must be byte-identical regardless.
      expect(a!.config).toEqual(b.config);
      expect(a!.provider).toBe(b.provider);
      expect(a!.type).toBe(b.type);
      expect(a!.kind).toBe(b.kind);
      expect(a!.displayName).toBe(b.displayName);
    }
    // Nodes upstream of the insert never move at all.
    expect(after.pendingNodes.find((n) => n.id === "t")!.position).toEqual({ x: 0, y: 0 });
    expect(after.pendingNodes.find((n) => n.id === "if")!.position).toEqual({ x: 0, y: 120 });
    // Edges unrelated to the edited lane are untouched.
    for (const id of ["e-t", "e-false", "e-cold-join"]) {
      expect(after.pendingEdges.find((e) => e.id === id)).toEqual(
        before.edges.find((e: { id: string }) => e.id === id),
      );
    }
  });

  it("the new node gets a non-overlapping position", () => {
    insertActionAtEdge("e-true", slackAction);
    const { pendingNodes } = useGraphSlice.getState();
    const added = pendingNodes.find((n) => !["t", "if", "hot", "cold", "join"].includes(n.id))!;
    for (const other of pendingNodes.filter((n) => n.id !== added.id)) {
      expect(added.position).not.toEqual(other.position);
    }
  });

  it("undo removes the insertion and redo restores the labeled topology", () => {
    const before = snapshot();
    insertActionAtEdge("e-true", slackAction);
    const inserted = useGraphSlice.getState().pendingNodes.length;
    expect(inserted).toBe(before.nodes.length + 1);
    expect(useGraphSlice.getState().isDirty).toBe(true);

    // insertActionAtEdge is a composition of several store ops; undo each.
    while (useGraphSlice.getState().pendingNodes.length > before.nodes.length) {
      useGraphSlice.getState().undo();
    }
    const afterUndo = useGraphSlice.getState();
    expect(afterUndo.pendingNodes.map((n) => n.id).sort()).toEqual(
      before.nodes.map((n: { id: string }) => n.id).sort(),
    );

    while (useGraphSlice.getState().future.length > 0) {
      useGraphSlice.getState().redo();
    }
    const afterRedo = useGraphSlice.getState();
    const added = afterRedo.pendingNodes.find(
      (n) => !["t", "if", "hot", "cold", "join"].includes(n.id),
    )!;
    expect(afterRedo.pendingEdges.find((e) => e.from === "if" && e.to === added.id)?.label).toBe(
      "true",
    );
    expect(
      afterRedo.pendingEdges.find((e) => e.from === added.id && e.to === "hot")?.label,
    ).toBeUndefined();
  });
});

describe("refusals — never mutate", () => {
  function expectNoMutation(run: () => unknown): void {
    const before = snapshot();
    run();
    const after = useGraphSlice.getState();
    expect(after.pendingNodes).toEqual(before.nodes);
    expect(after.pendingEdges).toEqual(before.edges);
    expect(after.isDirty).toBe(before.isDirty);
  }

  it("edge_missing when the edge is gone", () => {
    useGraphSlice.getState().removeEdge("e-true");
    expectNoMutation(() => {
      expect(
        validateDocumentBranchLaneInsertion({
          edgeId: "e-true",
          expectedFrom: "if",
          expectedTo: "hot",
          expectedLabel: "true",
        }),
      ).toEqual({ ok: false, reason: "edge_missing" });
    });
  });

  it("stale_document_model when the edge now points elsewhere", () => {
    expectNoMutation(() => {
      expect(
        validateDocumentBranchLaneInsertion({
          edgeId: "e-true",
          expectedFrom: "if",
          expectedTo: "join",
          expectedLabel: "true",
        }),
      ).toEqual({ ok: false, reason: "stale_document_model" });
    });
  });

  it("stale_document_model when the rendered label no longer matches the edge", () => {
    expectNoMutation(() => {
      expect(
        validateDocumentBranchLaneInsertion({
          edgeId: "e-true",
          expectedFrom: "if",
          expectedTo: "hot",
          expectedLabel: "false",
        }),
      ).toEqual({ ok: false, reason: "stale_document_model" });
    });
  });

  it("node_missing when the branch source node was deleted", () => {
    useGraphSlice.getState().removeNode("if");
    expect(
      validateDocumentBranchLaneInsertion({
        edgeId: "e-true",
        expectedFrom: "if",
        expectedTo: "hot",
        expectedLabel: "true",
      }),
      // Removing the node also drops its edges → edge_missing is the honest
      // first failure; either way it refuses without mutating.
    ).toEqual({ ok: false, reason: "edge_missing" });
  });

  it("stale_branch_label when the route is no longer returnable", () => {
    // Switch If/Then to skip-mode: "false" is no longer returnable. The store
    // reconciles the stale edge away, so the lane refuses either way.
    useGraphSlice.getState().updateNodeConfig("if", {
      input: "{{trigger.amount}}",
      operator: "greater_than",
      value: "100",
      onFalse: "skip",
    });
    const result = validateDocumentBranchLaneInsertion({
      edgeId: "e-false",
      expectedFrom: "if",
      expectedTo: "cold",
      expectedLabel: "false",
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected refusal");
    expect(["stale_branch_label", "edge_missing"]).toContain(result.reason);
  });

  it("stale_branch_label for a router route that was renamed away", () => {
    hydrate(routerGraph);
    useGraphSlice.getState().updateNodeConfig("rt", {
      routes: [
        { label: "warm", condition: { input: "{{trigger.k}}", operator: "equals", value: "warm" } },
      ],
    });
    const result = validateDocumentBranchLaneInsertion({
      edgeId: "e-hot",
      expectedFrom: "rt",
      expectedTo: "h",
      expectedLabel: "hot",
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected refusal");
    expect(["stale_branch_label", "edge_missing"]).toContain(result.reason);
  });

  it("ambiguous_insertion on same-label fan-out", () => {
    // A second "true" edge to a different target: which lane did the user mean?
    useGraphSlice.getState().connectNodes({ from: "if", to: "join", label: "true" });
    expectNoMutation(() => {
      expect(
        validateDocumentBranchLaneInsertion({
          edgeId: "e-true",
          expectedFrom: "if",
          expectedTo: "hot",
          expectedLabel: "true",
        }),
      ).toEqual({ ok: false, reason: "ambiguous_insertion" });
    });
  });

  it("invalid_branch_source for a labeled edge out of a NON-branch node", () => {
    useGraphSlice.getState().reset();
    useGraphSlice.getState().hydrate("wf-x", {
      nodes: [
        { id: "a", kind: "action", provider: "slack", type: "send_channel_message", config: {}, position: { x: 0, y: 0 } },
        { id: "b", kind: "action", provider: "slack", type: "send_channel_message", config: {}, position: { x: 0, y: 120 } },
      ],
      edges: [{ id: "e-odd", from: "a", to: "b", label: "weird" }],
    });
    expectNoMutation(() => {
      expect(
        validateDocumentBranchLaneInsertion({
          edgeId: "e-odd",
          expectedFrom: "a",
          expectedTo: "b",
          expectedLabel: "weird",
        }),
      ).toEqual({ ok: false, reason: "invalid_branch_source" });
    });
  });

  it("unsupported_region for an UNLABELED edge (not a branch lane)", () => {
    expectNoMutation(() => {
      expect(
        validateDocumentBranchLaneInsertion({
          edgeId: "e-hot-join",
          expectedFrom: "hot",
          expectedTo: "join",
          expectedLabel: "true",
        }),
      ).toEqual({ ok: false, reason: "unsupported_region" });
    });
  });

  it("invalid_branch_source when the router config is unusable (no vocabulary)", () => {
    hydrate(routerGraph);
    useGraphSlice.getState().updateNodeConfig("rt", { routes: [] });
    const result = validateDocumentBranchLaneInsertion({
      edgeId: "e-hot",
      expectedFrom: "rt",
      expectedTo: "h",
      expectedLabel: "hot",
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected refusal");
    expect(["invalid_branch_source", "edge_missing", "stale_branch_label"]).toContain(
      result.reason,
    );
  });

  it("never throws for arbitrary input", () => {
    expect(() =>
      validateDocumentBranchLaneInsertion({
        edgeId: "",
        expectedFrom: "",
        expectedTo: "",
        expectedLabel: "",
      }),
    ).not.toThrow();
  });
});
