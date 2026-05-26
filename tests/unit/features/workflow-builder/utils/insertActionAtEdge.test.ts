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
import type { ActionMeta } from "@/contracts/actionMeta";

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

  it("positions the inserted node at the midpoint of A and B", () => {
    seedChainAB();
    insertActionAtEdge("e-trig-act", httpAction);
    const newNode = useGraphSlice
      .getState()
      .pendingNodes.find(
        (n) => n.kind === "action" && n.type === "http.request",
      )!;
    // trig at (0,0), act at (100, 400) → midpoint (50, 200).
    expect(newNode.position).toEqual({ x: 50, y: 200 });
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
