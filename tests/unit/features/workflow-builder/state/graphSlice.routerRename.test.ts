/**
 * 5.DUAL-BUILDER-1 CS-7 — Router bulk-edit wiring consistency through the shared
 * config-commit path (`updateNodeConfig`, used by BOTH the Visual config panel
 * and the Document Guided Stop).
 *
 * Locked rule (product decision 7): an EXACT one-to-one route rename preserves
 * the renamed lane's wiring (the edge is relabeled old→new); any ambiguous /
 * bulk / add / remove edit stays conservative (stale edges drop; a route never
 * silently reconnects to an unrelated old lane).
 */

import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import type { WorkflowDefinition } from "@/contracts/workflow";

function slice() {
  return useGraphSlice.getState();
}

const routerDef: WorkflowDefinition = {
  nodes: [
    { id: "trig", kind: "trigger", provider: "native", type: "manual", config: {}, position: { x: 0, y: 0 } },
    {
      id: "r1",
      kind: "action",
      provider: "native",
      type: "router",
      config: {
        routes: [
          { label: "hot", condition: { input: "x", operator: "is_not_empty" } },
          { label: "warm", condition: { input: "y", operator: "is_not_empty" } },
        ],
      },
      position: { x: 0, y: 200 },
    },
    { id: "a", kind: "action", provider: "native", type: "delay", config: {}, position: { x: -100, y: 400 } },
    { id: "b", kind: "action", provider: "native", type: "delay", config: {}, position: { x: 100, y: 400 } },
  ],
  edges: [
    { id: "e1", from: "trig", to: "r1" },
    { id: "e2", from: "r1", to: "a", label: "hot" },
    { id: "e3", from: "r1", to: "b", label: "warm" },
  ],
};

beforeEach(() => {
  useGraphSlice.getState().reset();
  useGraphSlice.getState().hydrate("wf-router-rename", routerDef);
});

describe("updateNodeConfig — Router exact one-to-one rename preserves wiring", () => {
  it("relabels the renamed lane's edge (hot→scorching) and keeps its destination", () => {
    slice().updateNodeConfig("r1", {
      routes: [
        { label: "scorching", condition: { input: "x", operator: "is_not_empty" } },
        { label: "warm", condition: { input: "y", operator: "is_not_empty" } },
      ],
    });
    const out = slice()
      .pendingEdges.filter((e) => e.from === "r1")
      .map((e) => ({ to: e.to, label: e.label }));
    // The lane that pointed at "a" under "hot" now carries "scorching" → same target.
    expect(out).toEqual(
      expect.arrayContaining([
        { to: "a", label: "scorching" },
        { to: "b", label: "warm" },
      ]),
    );
    expect(out).toHaveLength(2);
    // The route's config label is the renamed one.
    const cfg = slice().pendingNodes.find((n) => n.id === "r1")!.config as {
      routes: Array<{ label: string }>;
    };
    expect(cfg.routes.map((r) => r.label)).toEqual(["scorching", "warm"]);
  });

  it("preserves wiring even when the renamed route's condition also changes", () => {
    slice().updateNodeConfig("r1", {
      routes: [
        { label: "scorching", condition: { input: "x", operator: "equals", value: "9" } },
        { label: "warm", condition: { input: "y", operator: "is_not_empty" } },
      ],
    });
    const hotLane = slice().pendingEdges.find((e) => e.from === "r1" && e.to === "a");
    expect(hotLane?.label).toBe("scorching");
  });

  it("a BULK rename (both labels change) stays conservative — renamed lanes drop, not reattach", () => {
    slice().updateNodeConfig("r1", {
      routes: [
        { label: "scorching", condition: { input: "x", operator: "is_not_empty" } },
        { label: "tepid", condition: { input: "y", operator: "is_not_empty" } },
      ],
    });
    // Neither old label remains, and neither new label silently reconnected to an
    // old lane — both edges drop (conservative). No unrelated reattachment.
    const out = slice().pendingEdges.filter((e) => e.from === "r1");
    expect(out.map((e) => e.label).sort()).toEqual([]);
  });

  it("a removal drops only the removed lane; the surviving lane keeps wiring", () => {
    slice().updateNodeConfig("r1", {
      routes: [{ label: "hot", condition: { input: "x", operator: "is_not_empty" } }],
    });
    const out = slice()
      .pendingEdges.filter((e) => e.from === "r1")
      .map((e) => ({ to: e.to, label: e.label }));
    expect(out).toEqual([{ to: "a", label: "hot" }]);
  });

  it("does not relabel onto a label an existing edge already carries (no ambiguous dup)", () => {
    // Rename hot→warm collides with the existing warm edge; classifier flags
    // collision → conservative. The renamed lane drops rather than duplicating.
    slice().updateNodeConfig("r1", {
      routes: [
        { label: "warm", condition: { input: "x", operator: "is_not_empty" } },
        { label: "warm2", condition: { input: "y", operator: "is_not_empty" } },
      ],
    });
    // "warm" edge (→ b) must not now also point → a; no edge carries "warm" twice.
    const warmEdges = slice().pendingEdges.filter((e) => e.from === "r1" && e.label === "warm");
    expect(warmEdges).toHaveLength(1);
    expect(warmEdges[0]!.to).toBe("b");
  });

  it("keeps a single undo/redo step for the rename", () => {
    slice().updateNodeConfig("r1", {
      routes: [
        { label: "scorching", condition: { input: "x", operator: "is_not_empty" } },
        { label: "warm", condition: { input: "y", operator: "is_not_empty" } },
      ],
    });
    expect(slice().pendingEdges.find((e) => e.to === "a")!.label).toBe("scorching");
    slice().undo();
    expect(slice().pendingEdges.find((e) => e.to === "a")!.label).toBe("hot");
    slice().redo();
    expect(slice().pendingEdges.find((e) => e.to === "a")!.label).toBe("scorching");
  });
});
