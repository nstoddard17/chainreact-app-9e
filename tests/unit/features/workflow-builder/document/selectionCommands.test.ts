/** @jest-environment node */
/**
 * Document SELECTION command boundary (5.DUAL-BUILDER-1 / CS-6).
 *
 * Proves duplicate / delete / move compose the EXISTING canonical graphSlice
 * actions, return typed results (never throw), refuse unsafe gestures WITHOUT
 * mutating, keep node ids/config canonical, and participate in shared undo/redo.
 */
import type { WorkflowDefinition, WorkflowNode } from "@/contracts/workflow";
import {
  duplicateDocumentAction,
  moveDocumentAction,
  removeDocumentBlock,
} from "@/features/workflow-builder/document/documentSelectionCommands";
import { useConfigSlice } from "@/features/workflow-builder/state/configSlice";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";

function clone(d: WorkflowDefinition): WorkflowDefinition {
  return JSON.parse(JSON.stringify(d)) as WorkflowDefinition;
}
function nodes(): readonly WorkflowNode[] {
  return useGraphSlice.getState().pendingNodes;
}
function edges() {
  return useGraphSlice.getState().pendingEdges;
}
function order(): string[] {
  // Linear order from the trigger following unlabeled edges.
  const byFrom = new Map(edges().map((e) => [e.from, e.to] as const));
  const out: string[] = [];
  let cur: string | undefined = nodes().find((n) => n.kind === "trigger")?.id;
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    out.push(cur);
    cur = byFrom.get(cur);
  }
  return out;
}

const linear: WorkflowDefinition = {
  nodes: [
    { id: "t", kind: "trigger", provider: "hubspot", type: "new_contact", config: {}, position: { x: 0, y: 0 } },
    { id: "a", kind: "action", provider: "slack", type: "send_channel_message", config: { text: "A" }, position: { x: 0, y: 120 } },
    { id: "b", kind: "action", provider: "slack", type: "send_channel_message", config: { text: "B" }, position: { x: 0, y: 240 } },
    { id: "c", kind: "action", provider: "slack", type: "send_channel_message", config: { text: "C" }, position: { x: 0, y: 360 } },
  ],
  edges: [
    { id: "e1", from: "t", to: "a" },
    { id: "e2", from: "a", to: "b" },
    { id: "e3", from: "b", to: "c" },
  ],
};

function forkWorkflow(): WorkflowDefinition {
  return {
    nodes: [
      { id: "t", kind: "trigger", provider: "hubspot", type: "new_contact", config: {}, position: { x: 0, y: 0 } },
      { id: "if", kind: "action", provider: "native", type: "if_then_condition", config: { input: "x", operator: "equals", value: "1", onFalse: "branch" }, position: { x: 0, y: 120 } },
      { id: "yes", kind: "action", provider: "slack", type: "send_channel_message", config: {}, position: { x: -100, y: 240 } },
      { id: "no", kind: "action", provider: "slack", type: "send_channel_message", config: {}, position: { x: 100, y: 240 } },
    ],
    edges: [
      { id: "e1", from: "t", to: "if" },
      { id: "e2", from: "if", to: "yes", label: "true" },
      { id: "e3", from: "if", to: "no", label: "false" },
    ],
  };
}

beforeEach(() => {
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
});

describe("duplicateDocumentAction", () => {
  it("copies a mid-chain linear action with a NEW id, inserted right after, preserving config", () => {
    useGraphSlice.getState().hydrate("wf", clone(linear));
    const res = duplicateDocumentAction({ nodeId: "b" });
    expect(res.ok).toBe(true);
    const dupId = res.ok ? res.nodeId! : "";
    expect(dupId).not.toBe("b");
    // a -> b -> dup -> c
    expect(order()).toEqual(["t", "a", "b", dupId, "c"]);
    const dup = nodes().find((n) => n.id === dupId)!;
    expect(dup.config).toEqual({ text: "B" });
    expect(dup.provider).toBe("slack");
  });

  it("appends a copy after a linear tail", () => {
    useGraphSlice.getState().hydrate("wf", clone(linear));
    const res = duplicateDocumentAction({ nodeId: "c" });
    expect(res.ok).toBe(true);
    const dupId = res.ok ? res.nodeId! : "";
    expect(order()).toEqual(["t", "a", "b", "c", dupId]);
  });

  it("refuses to duplicate the trigger WITHOUT mutating", () => {
    useGraphSlice.getState().hydrate("wf", clone(linear));
    const before = JSON.stringify({ n: nodes(), e: edges() });
    expect(duplicateDocumentAction({ nodeId: "t" })).toEqual({ ok: false, reason: "cannot_duplicate_trigger" });
    expect(JSON.stringify({ n: nodes(), e: edges() })).toBe(before);
  });

  it("refuses to duplicate a fork node (no canonical branch-duplication command)", () => {
    useGraphSlice.getState().hydrate("wf", forkWorkflow());
    const before = JSON.stringify({ n: nodes(), e: edges() });
    expect(duplicateDocumentAction({ nodeId: "if" })).toEqual({ ok: false, reason: "unsupported_fork_duplication" });
    expect(JSON.stringify({ n: nodes(), e: edges() })).toBe(before);
  });

  it("undo removes the duplicate; redo restores it", () => {
    useGraphSlice.getState().hydrate("wf", clone(linear));
    const res = duplicateDocumentAction({ nodeId: "c" });
    const dupId = res.ok ? res.nodeId! : "";
    const g = useGraphSlice.getState();
    while (useGraphSlice.getState().past.length > 0 && nodes().some((n) => n.id === dupId)) g.undo();
    expect(nodes().some((n) => n.id === dupId)).toBe(false);
    while (useGraphSlice.getState().future.length > 0 && !nodes().some((n) => n.id === dupId)) g.redo();
    expect(nodes().some((n) => n.id === dupId)).toBe(true);
  });
});

describe("removeDocumentBlock", () => {
  it("requires confirmation for a node with a downstream continuation, then deletes+rewires", () => {
    useGraphSlice.getState().hydrate("wf", clone(linear));
    const first = removeDocumentBlock({ nodeId: "b" });
    expect(first).toEqual({ ok: false, reason: "destructive_confirmation_required" });
    expect(nodes().some((n) => n.id === "b")).toBe(true);

    const confirmed = removeDocumentBlock({ nodeId: "b", confirmed: true });
    expect(confirmed.ok).toBe(true);
    // Canonical rewire: a -> c.
    expect(order()).toEqual(["t", "a", "c"]);
  });

  it("deletes a linear tail without confirmation (no downstream topology affected)", () => {
    useGraphSlice.getState().hydrate("wf", clone(linear));
    expect(removeDocumentBlock({ nodeId: "c" }).ok).toBe(true);
    expect(nodes().some((n) => n.id === "c")).toBe(false);
  });

  it("refuses to delete a fork node from the Document (Visual-Builder job)", () => {
    useGraphSlice.getState().hydrate("wf", forkWorkflow());
    const before = JSON.stringify({ n: nodes(), e: edges() });
    expect(removeDocumentBlock({ nodeId: "if", confirmed: true })).toEqual({ ok: false, reason: "unsupported_region" });
    expect(JSON.stringify({ n: nodes(), e: edges() })).toBe(before);
  });
});

describe("moveDocumentAction (adjacent-linear only)", () => {
  it("moves a mid-chain action later, swapping with its linear successor", () => {
    useGraphSlice.getState().hydrate("wf", clone(linear));
    expect(moveDocumentAction({ nodeId: "a", direction: "later" }).ok).toBe(true);
    expect(order()).toEqual(["t", "b", "a", "c"]);
  });

  it("moves a mid-chain action earlier", () => {
    useGraphSlice.getState().hydrate("wf", clone(linear));
    expect(moveDocumentAction({ nodeId: "c", direction: "earlier" }).ok).toBe(true);
    expect(order()).toEqual(["t", "a", "c", "b"]);
  });

  it("refuses to move the trigger", () => {
    useGraphSlice.getState().hydrate("wf", clone(linear));
    expect(moveDocumentAction({ nodeId: "t", direction: "later" })).toEqual({ ok: false, reason: "cannot_move_trigger" });
  });

  it("refuses to move earlier past the trigger (no swappable action target)", () => {
    useGraphSlice.getState().hydrate("wf", clone(linear));
    const before = JSON.stringify(edges());
    // 'a' has only the trigger before it → refuse (would displace the trigger).
    expect(moveDocumentAction({ nodeId: "a", direction: "earlier" })).toEqual({ ok: false, reason: "unsupported_region" });
    expect(JSON.stringify(edges())).toBe(before);
  });

  it("refuses to move across a fork/rejoin boundary WITHOUT mutating", () => {
    useGraphSlice.getState().hydrate("wf", forkWorkflow());
    const before = JSON.stringify(edges());
    // 'if' has labeled outgoing → not a linear pair.
    expect(moveDocumentAction({ nodeId: "yes", direction: "later" }).ok).toBe(false);
    // 'yes' is a lane step reached by a labeled edge → not linear.
    expect(JSON.stringify(edges())).toBe(before);
  });

  it("undo restores the original order", () => {
    useGraphSlice.getState().hydrate("wf", clone(linear));
    moveDocumentAction({ nodeId: "a", direction: "later" });
    expect(order()).toEqual(["t", "b", "a", "c"]);
    useGraphSlice.getState().undo();
    expect(order()).toEqual(["t", "a", "b", "c"]);
  });
});
