/** @jest-environment node */
/**
 * Tests for features/workflow-builder/utils/deleteNodeFromGraph
 *
 * Pure helper — graph in, graph out. Covers every branch enumerated in the
 * helper's behavior contract:
 *   1. unknown_node
 *   2. standalone (0 in, 0 out)
 *   3. last (≥1 in, 0 out)
 *   4. first (0 in, ≥1 out)
 *   5. rewirable (≥1 in, exactly 1 out)
 *      a. fresh rewire
 *      b. self-loop suppression
 *      c. duplicate suppression
 *      d. positions preserved on the remaining nodes
 *      e. fan-in heal (RECONV-1 S2): one rewire per incoming edge, labels
 *         preserved, per-candidate dedup/self-loop downgrade to warning
 *   6. multi-out blocked (≥1 in AND ≥2 out)
 *
 * Also covers:
 *   - deterministic id injection.
 *   - labeled outgoing edges count toward the multi-out block.
 *   - duplicate-suppression is unlabeled-only — labeled siblings are fine.
 *   - input arrays are not mutated (purity).
 */

import {
  deleteNodeFromGraph,
  type DeleteNodeFromGraphResult,
} from "@/features/workflow-builder/utils/deleteNodeFromGraph";
import type { WorkflowEdge, WorkflowNode } from "@/contracts/workflow";

function n(
  id: string,
  kind: "trigger" | "action",
  x = 0,
  y = 0,
): WorkflowNode {
  return {
    id,
    kind,
    provider: kind === "trigger" ? "slack" : "native",
    type: kind === "trigger" ? "slack.message" : "noop",
    config: {},
    position: { x, y },
  };
}

function e(
  id: string,
  from: string,
  to: string,
  label?: string,
): WorkflowEdge {
  return label === undefined ? { id, from, to } : { id, from, to, label };
}

function assertOk(
  result: DeleteNodeFromGraphResult,
): asserts result is Extract<DeleteNodeFromGraphResult, { ok: true }> {
  if (!result.ok) {
    throw new Error(
      `Expected ok result, got blocked: ${result.reason} — ${result.message}`,
    );
  }
}

describe("deleteNodeFromGraph — blocked branches", () => {
  it("blocks on unknown nodeId without mutating anything", () => {
    const nodes = [n("trig", "trigger")];
    const edges: WorkflowEdge[] = [];
    const result = deleteNodeFromGraph({
      nodes,
      edges,
      nodeId: "ghost",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("unknown_node");
    expect(result.message).toMatch(/no node with id/i);
  });

  it("blocks when a node has 2+ incoming AND 2+ outgoing edges (genuinely ambiguous)", () => {
    // Fan-in AND fan-out: A → mid, B → mid, mid → C, mid → D. With multiple
    // successors there is no single continuation to heal to — rewiring would
    // fan out N×M edges. Refuse; state untouched.
    const nodes = [
      n("a", "trigger"),
      n("b", "action"),
      n("mid", "action"),
      n("c", "action"),
      n("d", "action"),
    ];
    const edges = [
      e("e-a-mid", "a", "mid"),
      e("e-b-mid", "b", "mid"),
      e("e-mid-c", "mid", "c"),
      e("e-mid-d", "mid", "d"),
    ];
    const nodesBefore = [...nodes];
    const edgesBefore = [...edges];
    const result = deleteNodeFromGraph({ nodes, edges, nodeId: "mid" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("cannot_rewire_multi_edge");
    expect(result.message).toMatch(/multiple paths/i);
    expect(nodes).toEqual(nodesBefore);
    expect(edges).toEqual(edgesBefore);
  });

  it("blocks when a node has 1 incoming AND 2+ outgoing edges (router-style)", () => {
    // Router branching: trig → router; router → A; router → B. Deleting
    // `router` would lose the branch labels and fan-out semantics. Refuse.
    const nodes = [
      n("trig", "trigger"),
      n("router", "action"),
      n("a", "action"),
      n("b", "action"),
    ];
    const edges = [
      e("e-trig-router", "trig", "router"),
      e("e-router-a", "router", "a", "branch-a"),
      e("e-router-b", "router", "b", "branch-b"),
    ];
    const result = deleteNodeFromGraph({ nodes, edges, nodeId: "router" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("cannot_rewire_multi_edge");
  });

  it("does NOT block on multi-edge when one side is empty (last node with fan-in)", () => {
    // Fan-in tail: A → tail, B → tail. Tail has 2 incoming, 0 outgoing.
    // No rewire needed; both incoming edges drop. Unambiguous to delete.
    const nodes = [
      n("a", "trigger"),
      n("b", "action"),
      n("tail", "action"),
    ];
    const edges = [
      e("e-a-tail", "a", "tail"),
      e("e-b-tail", "b", "tail"),
    ];
    const result = deleteNodeFromGraph({ nodes, edges, nodeId: "tail" });
    assertOk(result);
    expect(result.nodes.map((x) => x.id).sort()).toEqual(["a", "b"]);
    expect(result.edges).toHaveLength(0);
    expect(result.rewiredEdgeId).toBeNull();
    expect(result.warning).toBeNull();
    expect(new Set(result.removedEdgeIds)).toEqual(
      new Set(["e-a-tail", "e-b-tail"]),
    );
  });
});

describe("deleteNodeFromGraph — standalone / last / first", () => {
  it("standalone node — removes only the node, no edge changes", () => {
    const nodes = [n("a", "trigger"), n("orphan", "action")];
    const edges: WorkflowEdge[] = [];
    const result = deleteNodeFromGraph({ nodes, edges, nodeId: "orphan" });
    assertOk(result);
    expect(result.nodes.map((x) => x.id)).toEqual(["a"]);
    expect(result.edges).toEqual([]);
    expect(result.deletedNode.id).toBe("orphan");
    expect(result.removedEdgeIds).toEqual([]);
    expect(result.rewiredEdgeId).toBeNull();
    expect(result.warning).toBeNull();
  });

  it("last action — drops the node + every incoming edge, no rewire", () => {
    // trig → tail. Delete tail. trig stays, edge gone.
    const nodes = [n("trig", "trigger"), n("tail", "action")];
    const edges = [e("e1", "trig", "tail")];
    const result = deleteNodeFromGraph({ nodes, edges, nodeId: "tail" });
    assertOk(result);
    expect(result.nodes.map((x) => x.id)).toEqual(["trig"]);
    expect(result.edges).toEqual([]);
    expect(result.removedEdgeIds).toEqual(["e1"]);
    expect(result.rewiredEdgeId).toBeNull();
    expect(result.warning).toBeNull();
  });

  it("first action after trigger (1 in, 1 out) → rewires Trigger → B (standard linear case)", () => {
    // trig → A → B. Delete A. Expect trig → B with no leftover edges.
    const nodes = [
      n("trig", "trigger"),
      n("a", "action"),
      n("b", "action"),
    ];
    const edges = [e("e-trig-a", "trig", "a"), e("e-a-b", "a", "b")];
    const result = deleteNodeFromGraph({
      nodes,
      edges,
      nodeId: "a",
      newEdgeId: () => "REWIRE-1",
    });
    assertOk(result);
    expect(result.nodes.map((x) => x.id)).toEqual(["trig", "b"]);
    expect(result.edges).toEqual([
      { id: "REWIRE-1", from: "trig", to: "b" },
    ]);
    expect([...result.removedEdgeIds].sort()).toEqual(["e-a-b", "e-trig-a"]);
    expect(result.rewiredEdgeId).toBe("REWIRE-1");
    expect(result.warning).toBeNull();
  });

  it("trigger with outgoing edges — drops trigger + all outgoing edges, no rewire", () => {
    // trig → a, trig → b (fan-out trigger). Delete trig. Both edges drop;
    // downstream actions become orphans (validation surfaces no_trigger).
    const nodes = [
      n("trig", "trigger"),
      n("a", "action"),
      n("b", "action"),
    ];
    const edges = [e("e-trig-a", "trig", "a"), e("e-trig-b", "trig", "b")];
    const result = deleteNodeFromGraph({ nodes, edges, nodeId: "trig" });
    assertOk(result);
    expect(result.nodes.map((x) => x.id).sort()).toEqual(["a", "b"]);
    expect(result.edges).toEqual([]);
    expect(result.rewiredEdgeId).toBeNull();
    expect(result.warning).toBeNull();
  });
});

describe("deleteNodeFromGraph — linear middle (1 in, 1 out)", () => {
  it("middle action: A → B → C → rewires A → C with a fresh id", () => {
    const nodes = [
      n("a", "trigger"),
      n("b", "action"),
      n("c", "action"),
    ];
    const edges = [e("e-a-b", "a", "b"), e("e-b-c", "b", "c")];
    const result = deleteNodeFromGraph({
      nodes,
      edges,
      nodeId: "b",
      newEdgeId: () => "REWIRE-X",
    });
    assertOk(result);
    expect(result.nodes.map((x) => x.id)).toEqual(["a", "c"]);
    expect(result.edges).toEqual([
      { id: "REWIRE-X", from: "a", to: "c" },
    ]);
    expect([...result.removedEdgeIds].sort()).toEqual(["e-a-b", "e-b-c"]);
    expect(result.rewiredEdgeId).toBe("REWIRE-X");
    expect(result.warning).toBeNull();
  });

  it("middle action with a back-edge (cycle through deleted node) — rewire suppressed (self-loop guard)", () => {
    // Pathological: A → B → A. Deleting B would create A → A. Skip.
    const nodes = [n("a", "action"), n("b", "action")];
    const edges = [e("e-a-b", "a", "b"), e("e-b-a", "b", "a")];
    const result = deleteNodeFromGraph({
      nodes,
      edges,
      nodeId: "b",
      newEdgeId: () => "SHOULD-NOT-BE-USED",
    });
    assertOk(result);
    expect(result.nodes.map((x) => x.id)).toEqual(["a"]);
    expect(result.edges).toEqual([]);
    expect(result.rewiredEdgeId).toBeNull();
    expect(result.warning).toBe("rewire_would_self_loop");
  });

  it("middle action where A → C already exists — rewire suppressed (duplicate guard)", () => {
    // trig → A → B → C, plus a direct trig→C shortcut. Deleting A would
    // want to rewire trig → B, but B itself rewires fine. Let's pick a
    // clearer scenario: trig → mid → c, and a direct trig → c already
    // exists. Deleting mid would want trig → c, which already exists.
    const nodes = [
      n("trig", "trigger"),
      n("mid", "action"),
      n("c", "action"),
    ];
    const edges = [
      e("e-trig-mid", "trig", "mid"),
      e("e-mid-c", "mid", "c"),
      e("e-trig-c", "trig", "c"),
    ];
    const result = deleteNodeFromGraph({
      nodes,
      edges,
      nodeId: "mid",
      newEdgeId: () => "SHOULD-NOT-BE-USED",
    });
    assertOk(result);
    expect(result.nodes.map((x) => x.id).sort()).toEqual(["c", "trig"]);
    // Only the direct trig → c survives.
    expect(result.edges).toEqual([
      { id: "e-trig-c", from: "trig", to: "c" },
    ]);
    expect(result.rewiredEdgeId).toBeNull();
    expect(result.warning).toBe("rewire_would_duplicate");
  });

  it("duplicate guard is unlabeled-only — a labeled sibling does NOT suppress rewire", () => {
    // trig → mid → c, plus a labeled router-style trig → c (label='retry').
    // Deleting mid still wants to make an unlabeled trig → c. The labeled
    // sibling is a different edge (distinct on the (from, to, label) key),
    // so the rewire SHOULD happen.
    const nodes = [
      n("trig", "trigger"),
      n("mid", "action"),
      n("c", "action"),
    ];
    const edges = [
      e("e-trig-mid", "trig", "mid"),
      e("e-mid-c", "mid", "c"),
      e("e-trig-c-retry", "trig", "c", "retry"),
    ];
    const result = deleteNodeFromGraph({
      nodes,
      edges,
      nodeId: "mid",
      newEdgeId: () => "REWIRE-FRESH",
    });
    assertOk(result);
    expect(result.warning).toBeNull();
    expect(result.rewiredEdgeId).toBe("REWIRE-FRESH");
    expect(result.edges).toEqual(
      expect.arrayContaining([
        { id: "REWIRE-FRESH", from: "trig", to: "c" },
        { id: "e-trig-c-retry", from: "trig", to: "c", label: "retry" },
      ]),
    );
    expect(result.edges).toHaveLength(2);
  });

  it("preserves remaining node positions byte-for-byte (does not relayout)", () => {
    const nodes = [
      n("a", "trigger", 10, 20),
      n("b", "action", 200, 400),
      n("c", "action", 500, 800),
    ];
    const edges = [e("e-a-b", "a", "b"), e("e-b-c", "b", "c")];
    const result = deleteNodeFromGraph({
      nodes,
      edges,
      nodeId: "b",
      newEdgeId: () => "REWIRE-POS",
    });
    assertOk(result);
    const aAfter = result.nodes.find((x) => x.id === "a")!;
    const cAfter = result.nodes.find((x) => x.id === "c")!;
    expect(aAfter.position).toEqual({ x: 10, y: 20 });
    expect(cAfter.position).toEqual({ x: 500, y: 800 });
  });
});

describe("deleteNodeFromGraph — reconverged shared node heal (≥2 in, 1 out) — RECONV-1 S2", () => {
  it("diamond: A→S, B→S, S→T heals to A→T and B→T (unlabeled sources stay unlabeled)", () => {
    // br —true→ A → S, br —false→ B → S, S → T. A/B are not branching
    // sources, so their incoming edges into S are unlabeled — the heals are
    // unlabeled too. The branch-route edges upstream are never touched.
    const nodes = [
      n("br", "trigger"),
      n("a", "action"),
      n("b", "action"),
      n("s", "action"),
      n("t", "action"),
    ];
    const edges = [
      e("e-br-a", "br", "a", "true"),
      e("e-br-b", "br", "b", "false"),
      e("e-a-s", "a", "s"),
      e("e-b-s", "b", "s"),
      e("e-s-t", "s", "t"),
    ];
    let seq = 0;
    const result = deleteNodeFromGraph({
      nodes,
      edges,
      nodeId: "s",
      newEdgeId: () => `HEAL-${++seq}`,
    });
    assertOk(result);
    expect(result.nodes.map((x) => x.id).sort()).toEqual(["a", "b", "br", "t"]);
    expect(result.edges).toEqual([
      { id: "e-br-a", from: "br", to: "a", label: "true" },
      { id: "e-br-b", from: "br", to: "b", label: "false" },
      { id: "HEAL-1", from: "a", to: "t" },
      { id: "HEAL-2", from: "b", to: "t" },
    ]);
    expect(new Set(result.removedEdgeIds)).toEqual(
      new Set(["e-a-s", "e-b-s", "e-s-t"]),
    );
    expect(result.rewiredEdgeId).toBe("HEAL-1");
    expect(result.warning).toBeNull();
  });

  it("direct rejoin: br —true→ S, br —false→ S, S→T heals BOTH routes to T with labels preserved", () => {
    const nodes = [n("br", "trigger"), n("s", "action"), n("t", "action")];
    const edges = [
      e("e-true", "br", "s", "true"),
      e("e-false", "br", "s", "false"),
      e("e-s-t", "s", "t"),
    ];
    let seq = 0;
    const result = deleteNodeFromGraph({
      nodes,
      edges,
      nodeId: "s",
      newEdgeId: () => `HEAL-${++seq}`,
    });
    assertOk(result);
    expect(result.nodes.map((x) => x.id).sort()).toEqual(["br", "t"]);
    expect(result.edges).toEqual([
      { id: "HEAL-1", from: "br", to: "t", label: "true" },
      { id: "HEAL-2", from: "br", to: "t", label: "false" },
    ]);
    expect(result.rewiredEdgeId).toBe("HEAL-1");
    expect(result.warning).toBeNull();
  });

  it("dedup: an existing A→T drops only that heal candidate (duplicate warning); the other heal still lands", () => {
    const nodes = [
      n("a", "trigger"),
      n("b", "action"),
      n("s", "action"),
      n("t", "action"),
    ];
    const edges = [
      e("e-a-s", "a", "s"),
      e("e-b-s", "b", "s"),
      e("e-s-t", "s", "t"),
      e("e-a-t", "a", "t"), // pre-existing shortcut — the A heal would duplicate it
    ];
    let seq = 0;
    const result = deleteNodeFromGraph({
      nodes,
      edges,
      nodeId: "s",
      newEdgeId: () => `HEAL-${++seq}`,
    });
    assertOk(result);
    expect(result.edges).toEqual([
      { id: "e-a-t", from: "a", to: "t" },
      { id: "HEAL-1", from: "b", to: "t" },
    ]);
    expect(result.rewiredEdgeId).toBe("HEAL-1");
    expect(result.warning).toBe("rewire_would_duplicate");
  });

  it("self-loop: an incoming edge FROM the successor suppresses only that heal candidate", () => {
    // t → s (back-edge) and a → s, with s → t. Healing t → t would
    // self-loop; skip it, keep the a → t heal, and break the cycle.
    const nodes = [n("a", "trigger"), n("s", "action"), n("t", "action")];
    const edges = [
      e("e-a-s", "a", "s"),
      e("e-t-s", "t", "s"),
      e("e-s-t", "s", "t"),
    ];
    let seq = 0;
    const result = deleteNodeFromGraph({
      nodes,
      edges,
      nodeId: "s",
      newEdgeId: () => `HEAL-${++seq}`,
    });
    assertOk(result);
    expect(result.edges).toEqual([{ id: "HEAL-1", from: "a", to: "t" }]);
    expect(result.rewiredEdgeId).toBe("HEAL-1");
    expect(result.warning).toBe("rewire_would_self_loop");
  });
});

describe("deleteNodeFromGraph — purity", () => {
  it("does not mutate the input nodes / edges arrays", () => {
    const nodes = [
      n("a", "trigger"),
      n("b", "action"),
      n("c", "action"),
    ];
    const edges = [e("e-a-b", "a", "b"), e("e-b-c", "b", "c")];
    const nodesBefore = [...nodes];
    const edgesBefore = [...edges];
    deleteNodeFromGraph({ nodes, edges, nodeId: "b" });
    expect(nodes).toEqual(nodesBefore);
    expect(edges).toEqual(edgesBefore);
  });
});

describe("deleteNodeFromGraph — edge-id generator default", () => {
  it("falls back to crypto.randomUUID when no generator is supplied", () => {
    const nodes = [
      n("a", "trigger"),
      n("b", "action"),
      n("c", "action"),
    ];
    const edges = [e("e-a-b", "a", "b"), e("e-b-c", "b", "c")];
    const result = deleteNodeFromGraph({ nodes, edges, nodeId: "b" });
    assertOk(result);
    expect(result.rewiredEdgeId).toMatch(/.+/); // any non-empty string
    expect(result.edges.find((x) => x.id === result.rewiredEdgeId)).toBeDefined();
  });
});
