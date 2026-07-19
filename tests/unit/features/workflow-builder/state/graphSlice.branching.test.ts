/**
 * graphSlice branch-route behavior (BRANCH-ENT-1 C4).
 *
 * Business rules protected:
 *  - connectNodes persists the branch label the connection was drawn from and
 *    dedupes on the (from, to, label) key — True and False may share a target,
 *    the same route can't be drawn twice.
 *  - Switching If/Then `onFalse` branch→skip removes the now-unreturnable
 *    False edge (no invisible stale edge); switching back does NOT silently
 *    reconnect it.
 *  - Removing/renaming a Router route drops that route's edges.
 *  - insertActionAtEdge keeps the branch label on the upstream half.
 *  - deleteNodeAndRewire keeps the incoming branch label on the rewire.
 */

import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import { insertActionAtEdge } from "@/features/workflow-builder/utils/insertActionAtEdge";
import type { ActionMeta } from "@/contracts/actionMeta";
import type { WorkflowDefinition } from "@/contracts/workflow";

const ifDef: WorkflowDefinition = {
  nodes: [
    { id: "trig", kind: "trigger", provider: "native", type: "manual", config: {}, position: { x: 0, y: 0 } },
    { id: "if1", kind: "action", provider: "native", type: "if_then_condition", config: { input: "x", operator: "is_not_empty", onFalse: "branch" }, position: { x: 0, y: 200 } },
    { id: "yes", kind: "action", provider: "native", type: "delay", config: {}, position: { x: -100, y: 400 } },
    { id: "no", kind: "action", provider: "native", type: "delay", config: {}, position: { x: 100, y: 400 } },
  ],
  edges: [
    { id: "e1", from: "trig", to: "if1" },
    { id: "e2", from: "if1", to: "yes", label: "true" },
    { id: "e3", from: "if1", to: "no", label: "false" },
  ],
};

function slice() {
  return useGraphSlice.getState();
}

beforeEach(() => {
  useGraphSlice.getState().reset();
  useGraphSlice.getState().hydrate("wf-1", ifDef);
});

describe("connectNodes — labeled routes", () => {
  it("persists the label and allows two different routes to reconverge on one target", () => {
    const a = slice().connectNodes({ from: "yes", to: "no", label: "true" });
    const b = slice().connectNodes({ from: "yes", to: "no", label: "false" });
    expect(a.label).toBe("true");
    expect(b.label).toBe("false");
    expect(
      slice().pendingEdges.filter((e) => e.from === "yes" && e.to === "no"),
    ).toHaveLength(2);
  });

  it("rejects drawing the SAME route to the same target twice", () => {
    expect(() =>
      slice().connectNodes({ from: "if1", to: "yes", label: "true" }),
    ).toThrow(/"true" route already connects/);
  });

  it("still allows an unlabeled cleanup edge alongside labeled routes", () => {
    const cleanup = slice().connectNodes({ from: "if1", to: "yes" });
    expect(cleanup.label).toBeUndefined();
    expect(
      slice().pendingEdges.filter((e) => e.from === "if1" && e.to === "yes"),
    ).toHaveLength(2);
  });
});

describe("updateNodeConfig — branch-edge reconciliation", () => {
  it("switching onFalse branch→skip removes the False edge (no invisible stale edge)", () => {
    slice().updateNodeConfig("if1", {
      input: "x",
      operator: "is_not_empty",
      onFalse: "skip",
    });
    const out = slice().pendingEdges.filter((e) => e.from === "if1");
    expect(out.map((e) => e.label)).toEqual(["true"]);
    expect(slice().pendingEdges.some((e) => e.id === "e3")).toBe(false);
  });

  it("re-enabling the False route does NOT silently reconnect it to the old target", () => {
    slice().updateNodeConfig("if1", { input: "x", operator: "is_not_empty", onFalse: "skip" });
    slice().updateNodeConfig("if1", { input: "x", operator: "is_not_empty", onFalse: "branch" });
    // The route exists again but stays UNWIRED until the user connects it.
    expect(
      slice().pendingEdges.some((e) => e.from === "if1" && e.label === "false"),
    ).toBe(false);
  });

  it("removing a Router route drops that route's edges; kept routes are untouched", () => {
    useGraphSlice.getState().reset();
    useGraphSlice.getState().hydrate("wf-2", {
      nodes: [
        { id: "trig", kind: "trigger", provider: "native", type: "manual", config: {}, position: { x: 0, y: 0 } },
        { id: "r1", kind: "action", provider: "native", type: "router", config: { routes: [{ label: "vip", condition: { input: "x", operator: "is_not_empty" } }, { label: "standard", condition: { input: "x", operator: "is_empty" } }] }, position: { x: 0, y: 200 } },
        { id: "a", kind: "action", provider: "native", type: "delay", config: {}, position: { x: -100, y: 400 } },
        { id: "b", kind: "action", provider: "native", type: "delay", config: {}, position: { x: 100, y: 400 } },
      ],
      edges: [
        { id: "e1", from: "trig", to: "r1" },
        { id: "e2", from: "r1", to: "a", label: "vip" },
        { id: "e3", from: "r1", to: "b", label: "standard" },
      ],
    });
    slice().updateNodeConfig("r1", {
      routes: [{ label: "vip", condition: { input: "x", operator: "is_not_empty" } }],
    });
    const out = slice().pendingEdges.filter((e) => e.from === "r1");
    expect(out.map((e) => e.label)).toEqual(["vip"]);
  });

  it("an in-progress (invalid) Router config never prunes edges — routes validation owns that state", () => {
    useGraphSlice.getState().reset();
    useGraphSlice.getState().hydrate("wf-3", {
      nodes: [
        { id: "r1", kind: "action", provider: "native", type: "router", config: { routes: [{ label: "vip" }] }, position: { x: 0, y: 0 } },
        { id: "a", kind: "action", provider: "native", type: "delay", config: {}, position: { x: 0, y: 200 } },
      ],
      edges: [{ id: "e2", from: "r1", to: "a", label: "vip" }],
    });
    // Mid-edit: user blanked a route label → vocabulary unknowable → keep edges.
    slice().updateNodeConfig("r1", { routes: [{ label: "" }] });
    expect(slice().pendingEdges).toHaveLength(1);
  });
});

describe("insertActionAtEdge — label preservation", () => {
  const meta: ActionMeta = {
    key: "native:delay",
    provider: "native",
    type: "delay",
    displayName: "Delay",
    description: "Wait",
    category: "logic",
    requiresIntegration: false,
    fields: [],
    outputs: [],
    producesFileRef: false,
    consumesFileRef: false,
    displayOrder: 1,
    isDestructive: false,
    requiresConfirmation: false,
    riskLevel: "low",
  };

  it("inserting on a True edge keeps the True label on the upstream half", () => {
    insertActionAtEdge("e2", meta); // if1 —true→ yes
    const edges = slice().pendingEdges;
    const upstream = edges.find((e) => e.from === "if1" && e.label === "true");
    expect(upstream).toBeDefined();
    const inserted = upstream!.to;
    const downstream = edges.find((e) => e.from === inserted && e.to === "yes");
    expect(downstream).toBeDefined();
    expect(downstream!.label).toBeUndefined();
    // The original labeled edge is gone; the branch was never duplicated.
    expect(edges.some((e) => e.id === "e2")).toBe(false);
  });
});

describe("deleteNodeAndRewire — label preservation", () => {
  it("deleting a linear node inside the True branch keeps the True label on the rewire", () => {
    // Extend: yes → tail, then delete `yes` (1 in via label true, 1 out).
    slice().connectNodes({ from: "yes", to: "no" });
    const result = slice().deleteNodeAndRewire("yes");
    expect(result.ok).toBe(true);
    const rewired = slice().pendingEdges.find(
      (e) => e.from === "if1" && e.to === "no" && e.label === "true",
    );
    expect(rewired).toBeDefined();
  });
});
