/** @jest-environment node */
/**
 * DOC-FINAL-ACCEPTANCE-1 — the single governed destructive-preview classifier.
 *
 * Proves what counts as destructive (removes steps and/or cuts a connection
 * between two surviving steps), that additive skeletons are never destructive,
 * that a dropped edge whose endpoint was removed is NOT double-counted, and that
 * the shared confirmation copy + removal description are stable.
 */
import {
  classifyDestructivePreview,
  describeDestructiveRemoval,
  DESTRUCTIVE_APPLY_CONFIRM,
} from "@/core/workflows/destructivePreview";
import type { WorkflowDefinition, WorkflowNode, WorkflowEdge } from "@/contracts/workflow";

function node(id: string, over: Partial<WorkflowNode> = {}): WorkflowNode {
  return {
    id,
    kind: "action",
    provider: "slack",
    type: "send_channel_message",
    config: {},
    position: { x: 0, y: 0 },
    ...over,
  } as WorkflowNode;
}
function edge(id: string, from: string, to: string, label?: string): WorkflowEdge {
  return { id, from, to, ...(label !== undefined ? { label } : {}) } as WorkflowEdge;
}

const liveNodes = [
  node("t", { kind: "trigger", provider: "hubspot", type: "new_contact" }),
  node("a"),
  node("b"),
];
const liveEdges = [edge("e-ta", "t", "a"), edge("e-ab", "a", "b")];

describe("classifyDestructivePreview", () => {
  it("additive skeleton (no proposedDefinition) is never destructive", () => {
    const c = classifyDestructivePreview({ liveNodes, liveEdges, proposedDefinition: null });
    expect(c.isDestructive).toBe(false);
    expect(c.removedStepCount).toBe(0);
    expect(c.removedConnectionCount).toBe(0);
  });

  it("an edit that only adds/changes is not destructive", () => {
    const proposed: WorkflowDefinition = {
      nodes: [...liveNodes, node("c")],
      edges: [...liveEdges, edge("e-bc", "b", "c")],
    };
    const c = classifyDestructivePreview({ liveNodes, liveEdges, proposedDefinition: proposed });
    expect(c.isDestructive).toBe(false);
  });

  it("removing a step is destructive and counts the step", () => {
    const proposed: WorkflowDefinition = {
      nodes: [node("t", { kind: "trigger", provider: "hubspot", type: "new_contact" }), node("a")],
      edges: [edge("e-ta", "t", "a")],
    };
    const c = classifyDestructivePreview({ liveNodes, liveEdges, proposedDefinition: proposed });
    expect(c.isDestructive).toBe(true);
    expect(c.removedStepCount).toBe(1);
    // The dropped edge e-ab had endpoint "b" removed → NOT a counted connection cut.
    expect(c.removedConnectionCount).toBe(0);
    expect(c.removedStepTitles.length).toBe(1);
  });

  it("cutting a connection between two surviving steps is destructive", () => {
    // All three nodes remain; the a→b edge is dropped (t now connects straight to b).
    const proposed: WorkflowDefinition = {
      nodes: liveNodes,
      edges: [edge("e-ta", "t", "a"), edge("e-tb", "t", "b")],
    };
    const c = classifyDestructivePreview({ liveNodes, liveEdges, proposedDefinition: proposed });
    expect(c.isDestructive).toBe(true);
    expect(c.removedStepCount).toBe(0);
    expect(c.removedConnectionCount).toBe(1);
  });

  it("does not double-count a dropped edge whose endpoint was removed", () => {
    // Remove b entirely: e-ab disappears but is attributed to the step removal.
    const proposed: WorkflowDefinition = {
      nodes: [node("t", { kind: "trigger", provider: "hubspot", type: "new_contact" }), node("a")],
      edges: [edge("e-ta", "t", "a")],
    };
    const c = classifyDestructivePreview({ liveNodes, liveEdges, proposedDefinition: proposed });
    expect(c.removedStepCount).toBe(1);
    expect(c.removedConnectionCount).toBe(0);
  });
});

describe("describeDestructiveRemoval", () => {
  it("describes steps and connections with correct pluralization", () => {
    expect(describeDestructiveRemoval({ removedStepCount: 1, removedConnectionCount: 0 })).toBe(
      "Removes 1 step.",
    );
    expect(describeDestructiveRemoval({ removedStepCount: 2, removedConnectionCount: 0 })).toBe(
      "Removes 2 steps.",
    );
    expect(describeDestructiveRemoval({ removedStepCount: 0, removedConnectionCount: 1 })).toBe(
      "Removes 1 connection.",
    );
    expect(describeDestructiveRemoval({ removedStepCount: 2, removedConnectionCount: 3 })).toBe(
      "Removes 2 steps and 3 connections.",
    );
    expect(describeDestructiveRemoval({ removedStepCount: 0, removedConnectionCount: 0 })).toBeNull();
  });
});

describe("DESTRUCTIVE_APPLY_CONFIRM copy", () => {
  it("uses the approved consequence-first vocabulary", () => {
    expect(DESTRUCTIVE_APPLY_CONFIRM.title).toBe("Apply destructive change?");
    expect(DESTRUCTIVE_APPLY_CONFIRM.body).toMatch(/removes workflow steps or connections/i);
    expect(DESTRUCTIVE_APPLY_CONFIRM.cancelLabel).toBe("Keep my workflow");
    expect(DESTRUCTIVE_APPLY_CONFIRM.applyLabel).toBe("Apply removal");
  });
});
