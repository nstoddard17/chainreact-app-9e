/**
 * Tests for features/workflow-builder/utils/computeKeyboardDeleteIntent
 *
 * Pure classifier. Covers all four cases:
 *   - 0 selected nodes → proceed (edge-only delete)
 *   - 1 selected node, rewire-able → single + preview.ok = true with rewire
 *   - 1 selected node, blocked → single + preview.ok = false
 *   - 2+ selected nodes → multi (count)
 */
import { computeKeyboardDeleteIntent } from "@/features/workflow-builder/utils/computeKeyboardDeleteIntent";
import type { WorkflowEdge, WorkflowNode } from "@/contracts/workflow";

function n(
  id: string,
  kind: "trigger" | "action",
): WorkflowNode {
  return {
    id,
    kind,
    provider: kind === "trigger" ? "slack" : "native",
    type: kind === "trigger" ? "slack.message" : "noop",
    config: {},
    position: { x: 0, y: 0 },
  };
}

function e(id: string, from: string, to: string): WorkflowEdge {
  return { id, from, to };
}

describe("computeKeyboardDeleteIntent", () => {
  it("returns 'proceed' when zero nodes are selected (edges-only delete intent)", () => {
    const intent = computeKeyboardDeleteIntent({
      selectedNodeIds: [],
      pendingNodes: [n("a", "trigger"), n("b", "action")],
      pendingEdges: [e("e-a-b", "a", "b")],
    });
    expect(intent).toEqual({ kind: "proceed" });
  });

  it("returns 'multi' with count when 2+ nodes are selected (blocked)", () => {
    const intent = computeKeyboardDeleteIntent({
      selectedNodeIds: ["a", "b"],
      pendingNodes: [n("a", "trigger"), n("b", "action")],
      pendingEdges: [e("e-a-b", "a", "b")],
    });
    expect(intent.kind).toBe("multi");
    if (intent.kind !== "multi") return;
    expect(intent.count).toBe(2);
  });

  it("returns 'multi' with count for 3+ selected nodes", () => {
    const intent = computeKeyboardDeleteIntent({
      selectedNodeIds: ["a", "b", "c"],
      pendingNodes: [n("a", "trigger"), n("b", "action"), n("c", "action")],
      pendingEdges: [e("e-a-b", "a", "b"), e("e-b-c", "b", "c")],
    });
    expect(intent.kind).toBe("multi");
    if (intent.kind !== "multi") return;
    expect(intent.count).toBe(3);
  });

  it("returns 'single' with a rewire preview for a linear middle node", () => {
    const intent = computeKeyboardDeleteIntent({
      selectedNodeIds: ["b"],
      pendingNodes: [
        n("a", "trigger"),
        n("b", "action"),
        n("c", "action"),
      ],
      pendingEdges: [e("e-a-b", "a", "b"), e("e-b-c", "b", "c")],
    });
    expect(intent.kind).toBe("single");
    if (intent.kind !== "single") return;
    expect(intent.nodeId).toBe("b");
    expect(intent.preview.ok).toBe(true);
    if (!intent.preview.ok) return;
    expect(intent.preview.rewiredEdgeId).not.toBeNull();
    expect(intent.preview.warning).toBeNull();
  });

  it("returns 'single' with a blocked preview for a multi-edge router-style node", () => {
    const intent = computeKeyboardDeleteIntent({
      selectedNodeIds: ["router"],
      pendingNodes: [
        n("trig", "trigger"),
        n("router", "action"),
        n("a", "action"),
        n("b", "action"),
      ],
      pendingEdges: [
        e("e-trig-router", "trig", "router"),
        { id: "e-router-a", from: "router", to: "a", label: "branch-a" },
        { id: "e-router-b", from: "router", to: "b", label: "branch-b" },
      ],
    });
    expect(intent.kind).toBe("single");
    if (intent.kind !== "single") return;
    expect(intent.preview.ok).toBe(false);
    if (intent.preview.ok) return;
    expect(intent.preview.reason).toBe("cannot_rewire_multi_edge");
  });

  it("returns 'single' for a standalone node (preview ok, no rewire, no warning)", () => {
    const intent = computeKeyboardDeleteIntent({
      selectedNodeIds: ["orphan"],
      pendingNodes: [n("trig", "trigger"), n("orphan", "action")],
      pendingEdges: [],
    });
    expect(intent.kind).toBe("single");
    if (intent.kind !== "single") return;
    expect(intent.preview.ok).toBe(true);
    if (!intent.preview.ok) return;
    expect(intent.preview.rewiredEdgeId).toBeNull();
    expect(intent.preview.removedEdgeIds).toEqual([]);
  });

  it("returns 'single' for an unknown nodeId → preview.ok = false, reason = unknown_node", () => {
    const intent = computeKeyboardDeleteIntent({
      selectedNodeIds: ["ghost"],
      pendingNodes: [n("trig", "trigger")],
      pendingEdges: [],
    });
    expect(intent.kind).toBe("single");
    if (intent.kind !== "single") return;
    expect(intent.preview.ok).toBe(false);
    if (intent.preview.ok) return;
    expect(intent.preview.reason).toBe("unknown_node");
  });
});
