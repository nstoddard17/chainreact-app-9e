/**
 * Tests for features/workflow-builder/utils/insertActionAtEdge.
 *
 * The helper composes graphSlice's public ops (no slice contract
 * change). Tests verify the resulting topology: A → N → B with the
 * original A → B edge gone and the auto-edge that `addActionFromMeta`
 * creates also gone.
 */
import { insertActionAtEdge } from "@/features/workflow-builder/utils/insertActionAtEdge";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import { positionsOverlap } from "@/features/workflow-builder/utils/workflowLayout";
import type { ActionMeta } from "@/contracts/actionMeta";

/** Assert no two pending nodes overlap (the BUILDER-CANVAS-LAYOUT-2 invariant). */
function expectNoOverlaps(): void {
  const nodes = useGraphSlice.getState().pendingNodes;
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      expect(positionsOverlap(nodes[i]!.position, nodes[j]!.position)).toBe(false);
    }
  }
}

const httpAction = {
  key: "native:http.request",
  provider: "native",
  type: "http.request",
  displayName: "HTTP Request",
  description: "Make an HTTP request.",
  fields: [],
  payloadShape: [],
  category: "data",
  requiresIntegration: false,
  hasSideEffects: true,
  destructive: false,
  riskLevel: "medium",
  displayOrder: 10,
} as unknown as ActionMeta;

function seedChainAB(): void {
  useGraphSlice.getState().reset();
  useGraphSlice.getState().hydrate("wf-1", {
    nodes: [
      {
        id: "trig",
        kind: "trigger",
        provider: "slack",
        type: "slack.message.channel",
        config: {},
        position: { x: 0, y: 0 },
      },
      {
        id: "act",
        kind: "action",
        provider: "slack",
        type: "slack.send_message",
        config: {},
        position: { x: 100, y: 400 },
      },
    ],
    edges: [{ id: "e-trig-act", from: "trig", to: "act" }],
  });
}

beforeEach(() => {
  useGraphSlice.getState().reset();
});

describe("insertActionAtEdge", () => {
  it("rewires A → B into A → N → B and removes the auto-edge", () => {
    seedChainAB();
    insertActionAtEdge("e-trig-act", httpAction);
    const { pendingNodes, pendingEdges } = useGraphSlice.getState();
    expect(pendingNodes).toHaveLength(3);
    const newNode = pendingNodes.find(
      (n) => n.kind === "action" && n.type === "http.request",
    )!;
    expect(newNode).toBeDefined();
    expect(pendingEdges).toHaveLength(2);
    expect(pendingEdges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: "trig", to: newNode.id }),
        expect.objectContaining({ from: newNode.id, to: "act" }),
      ]),
    );
    expect(pendingEdges.find((e) => e.id === "e-trig-act")).toBeUndefined();
  });

  it("places the inserted node on a non-overlapping row below A — never the overlapping midpoint (BUILDER-CANVAS-LAYOUT-2)", () => {
    seedChainAB();
    insertActionAtEdge("e-trig-act", httpAction);
    const newNode = useGraphSlice
      .getState()
      .pendingNodes.find(
        (n) => n.kind === "action" && n.type === "http.request",
      )!;
    // trig at (0,0), act at (100, 400). The endpoints are already 400px apart, so
    // nothing shifts; N drops one clean row below A — NOT the old (50, 200)
    // midpoint that overlapped both endpoints.
    expect(newNode.position).toEqual({ x: 0, y: 120 });
    // act endpoint stays put (already enough room).
    expect(
      useGraphSlice.getState().pendingNodes.find((n) => n.id === "act")!.position,
    ).toEqual({ x: 100, y: 400 });
    expectNoOverlaps();
  });

  it("pushes the downstream chain down to open room when A and B are one row apart (the overlap case)", () => {
    useGraphSlice.getState().reset();
    useGraphSlice.getState().hydrate("wf-1", {
      nodes: [
        { id: "trig", kind: "trigger", provider: "slack", type: "t", config: {}, position: { x: 0, y: 0 } },
        { id: "a", kind: "action", provider: "slack", type: "x", config: {}, position: { x: 0, y: 120 } },
        { id: "b", kind: "action", provider: "slack", type: "x", config: {}, position: { x: 0, y: 240 } },
      ],
      edges: [
        { id: "e1", from: "trig", to: "a" },
        { id: "e2", from: "a", to: "b" },
      ],
    });
    // Insert between trig and a — the midpoint (0,60) would overlap both.
    insertActionAtEdge("e1", httpAction);
    const nodes = useGraphSlice.getState().pendingNodes;
    const newNode = nodes.find((n) => n.type === "http.request")!;
    // N takes the clean row below the trigger; a and b each shift down one row.
    expect(newNode.position).toEqual({ x: 0, y: 120 });
    expect(nodes.find((n) => n.id === "a")!.position).toEqual({ x: 0, y: 240 });
    expect(nodes.find((n) => n.id === "b")!.position).toEqual({ x: 0, y: 360 });
    expectNoOverlaps();
    // Topology: trig → N → a → b.
    const edges = useGraphSlice.getState().pendingEdges;
    expect(edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: "trig", to: newNode.id }),
        expect.objectContaining({ from: newNode.id, to: "a" }),
        expect.objectContaining({ from: "a", to: "b" }),
      ]),
    );
  });

  it("does not disturb a parallel branch and never overlaps it (branch-safe)", () => {
    useGraphSlice.getState().reset();
    useGraphSlice.getState().hydrate("wf-1", {
      nodes: [
        { id: "trig", kind: "trigger", provider: "slack", type: "t", config: {}, position: { x: 0, y: 0 } },
        { id: "a", kind: "action", provider: "slack", type: "x", config: {}, position: { x: 0, y: 120 } },
        { id: "c", kind: "action", provider: "gmail", type: "x", config: {}, position: { x: 320, y: 120 } },
      ],
      edges: [
        { id: "e-a", from: "trig", to: "a" },
        { id: "e-c", from: "trig", to: "c" },
      ],
    });
    // Insert on the trig→a branch only.
    insertActionAtEdge("e-a", httpAction);
    const nodes = useGraphSlice.getState().pendingNodes;
    // The OTHER branch (c) is untouched.
    expect(nodes.find((n) => n.id === "c")!.position).toEqual({ x: 320, y: 120 });
    // a shifted down to open room; the inserted node is non-overlapping with everything.
    expect(nodes.find((n) => n.id === "a")!.position).toEqual({ x: 0, y: 240 });
    expectNoOverlaps();
    // Both branches still wired from the trigger; only the clicked edge was rewired.
    const edges = useGraphSlice.getState().pendingEdges;
    const newNode = nodes.find((n) => n.type === "http.request")!;
    expect(edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: "trig", to: newNode.id }),
        expect.objectContaining({ from: newNode.id, to: "a" }),
        expect.objectContaining({ from: "trig", to: "c" }),
      ]),
    );
  });

  it("append-at-end (LAYOUT-1) and Arrange (autoLayout) still work after a mid-chain insert", () => {
    useGraphSlice.getState().reset();
    useGraphSlice.getState().hydrate("wf-1", {
      nodes: [
        { id: "trig", kind: "trigger", provider: "slack", type: "t", config: {}, position: { x: 0, y: 0 } },
        { id: "a", kind: "action", provider: "slack", type: "x", config: {}, position: { x: 0, y: 120 } },
      ],
      edges: [{ id: "e1", from: "trig", to: "a" }],
    });
    // Mid-chain insert between trig and a.
    insertActionAtEdge("e1", httpAction);
    // Append-at-end (LAYOUT-1) — anchors on the chain tail (a) and never overlaps.
    const appended = useGraphSlice.getState().addAction({ provider: "gmail" });
    expectNoOverlaps();
    // The appended node hangs off the chain tail `a`, not the inserted middle node.
    expect(
      useGraphSlice.getState().pendingEdges.find((e) => e.to === appended.id)!.from,
    ).toBe("a");
    // Arrange still produces a clean, non-overlapping single column.
    useGraphSlice.getState().autoLayout();
    expectNoOverlaps();
    const ys = useGraphSlice
      .getState()
      .pendingNodes.map((n) => n.position.y)
      .sort((p, q) => p - q);
    expect(ys).toEqual([0, 120, 240, 360]); // four nodes, one clean column
  });

  it("is a no-op when the target edge id doesn't exist", () => {
    seedChainAB();
    const beforeNodes = useGraphSlice.getState().pendingNodes.length;
    const beforeEdges = useGraphSlice.getState().pendingEdges.length;
    insertActionAtEdge("does-not-exist", httpAction);
    expect(useGraphSlice.getState().pendingNodes).toHaveLength(beforeNodes);
    expect(useGraphSlice.getState().pendingEdges).toHaveLength(beforeEdges);
  });

  it("flips graphSlice into the dirty state (insertion is an unsaved edit)", () => {
    seedChainAB();
    expect(useGraphSlice.getState().isDirty).toBe(false);
    insertActionAtEdge("e-trig-act", httpAction);
    expect(useGraphSlice.getState().isDirty).toBe(true);
  });

  it("works for a 3-node chain — only the clicked edge is rewired", () => {
    useGraphSlice.getState().reset();
    useGraphSlice.getState().hydrate("wf-1", {
      nodes: [
        {
          id: "a",
          kind: "trigger",
          provider: "slack",
          type: "slack.message.channel",
          config: {},
          position: { x: 0, y: 0 },
        },
        {
          id: "b",
          kind: "action",
          provider: "slack",
          type: "slack.send_message",
          config: {},
          position: { x: 0, y: 200 },
        },
        {
          id: "c",
          kind: "action",
          provider: "slack",
          type: "slack.send_message",
          config: {},
          position: { x: 0, y: 400 },
        },
      ],
      edges: [
        { id: "e-a-b", from: "a", to: "b" },
        { id: "e-b-c", from: "b", to: "c" },
      ],
    });
    insertActionAtEdge("e-a-b", httpAction);
    const { pendingEdges } = useGraphSlice.getState();
    // Original a→b edge gone; b→c untouched; two new edges replace a→b.
    expect(pendingEdges.find((e) => e.id === "e-a-b")).toBeUndefined();
    expect(pendingEdges.find((e) => e.id === "e-b-c")).toBeDefined();
    const newNode = useGraphSlice
      .getState()
      .pendingNodes.find(
        (n) => n.kind === "action" && n.type === "http.request",
      )!;
    expect(pendingEdges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: "a", to: newNode.id }),
        expect.objectContaining({ from: newNode.id, to: "b" }),
        expect.objectContaining({ from: "b", to: "c" }),
      ]),
    );
  });
});
