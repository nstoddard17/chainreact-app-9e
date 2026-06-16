/**
 * Pure canvas-layout helpers (Slice 4.BUILDER-CANVAS-LAYOUT-1).
 *
 * Covers the deterministic geometry the builder uses to append a node without
 * overlap, find the chain tail for "add at end", and arrange the whole graph.
 */
import type { WorkflowEdge, WorkflowNode } from "@/contracts/workflow";
import {
  LAYOUT_BRANCH_GAP_X,
  LAYOUT_ROW_GAP_Y,
  computeNonOverlappingPosition,
  findChainTailId,
  layoutWorkflowGraph,
  positionsOverlap,
} from "@/features/workflow-builder/utils/workflowLayout";

function node(
  id: string,
  kind: "trigger" | "action",
  x: number,
  y: number,
): WorkflowNode {
  return { id, kind, provider: "p", type: "t", config: {}, position: { x, y } };
}
const edge = (id: string, from: string, to: string): WorkflowEdge => ({ id, from, to });

describe("positionsOverlap", () => {
  it("true for the exact same position; false a full row apart", () => {
    expect(positionsOverlap({ x: 0, y: 0 }, { x: 0, y: 0 })).toBe(true);
    // ROW_GAP (120) exceeds the vertical overlap box → adjacent rows don't overlap.
    expect(positionsOverlap({ x: 0, y: 0 }, { x: 0, y: LAYOUT_ROW_GAP_Y })).toBe(false);
    // A full branch column apart → no overlap.
    expect(positionsOverlap({ x: 0, y: 0 }, { x: LAYOUT_BRANCH_GAP_X, y: 0 })).toBe(false);
  });
});

describe("findChainTailId", () => {
  it("returns the sole leaf action of a linear chain", () => {
    const nodes = [node("t", "trigger", 0, 0), node("a1", "action", 0, 120), node("a2", "action", 0, 240)];
    const edges = [edge("e1", "t", "a1"), edge("e2", "a1", "a2")];
    expect(findChainTailId(nodes, edges)).toBe("a2");
  });

  it("returns null for a trigger-only workflow (trigger is not a chain tail)", () => {
    expect(findChainTailId([node("t", "trigger", 0, 0)], [])).toBeNull();
  });

  it("returns null when the tail is ambiguous (a branch → two leaves)", () => {
    const nodes = [node("t", "trigger", 0, 0), node("a", "action", 0, 120), node("b", "action", 320, 120)];
    const edges = [edge("e1", "t", "a"), edge("e2", "t", "b")];
    expect(findChainTailId(nodes, edges)).toBeNull();
  });

  it("returns null for a pure cycle (no leaf)", () => {
    const nodes = [node("a", "action", 0, 0), node("b", "action", 0, 120)];
    const edges = [edge("e1", "a", "b"), edge("e2", "b", "a")];
    expect(findChainTailId(nodes, edges)).toBeNull();
  });
});

describe("computeNonOverlappingPosition", () => {
  it("places one row below the anchor when the slot is clear", () => {
    const anchor = { x: 0, y: 120 };
    const pos = computeNonOverlappingPosition(anchor, [node("a", "action", 0, 120)]);
    expect(pos).toEqual({ x: 0, y: 240 });
  });

  it("steps further down until clear when the slot directly below is occupied", () => {
    // Anchor a1 at y=120; a2 already sits at y=240 (the first candidate slot).
    const anchor = { x: 0, y: 120 };
    const existing = [node("a1", "action", 0, 120), node("a2", "action", 0, 240)];
    const pos = computeNonOverlappingPosition(anchor, existing);
    expect(pos).toEqual({ x: 0, y: 360 });
  });

  it("never collides with any existing node", () => {
    const existing = [
      node("a", "action", 0, 0),
      node("b", "action", 0, 120),
      node("c", "action", 0, 240),
    ];
    const pos = computeNonOverlappingPosition({ x: 0, y: 0 }, existing);
    expect(existing.some((n) => positionsOverlap(n.position, pos))).toBe(false);
  });
});

describe("layoutWorkflowGraph", () => {
  it("lays a linear chain into a single column with even row spacing", () => {
    // Deliberately messy input positions — layout normalizes them.
    const nodes = [
      node("t", "trigger", 99, 5),
      node("a1", "action", -40, 999),
      node("a2", "action", 200, 12),
    ];
    const edges = [edge("e1", "t", "a1"), edge("e2", "a1", "a2")];
    const out = layoutWorkflowGraph(nodes, edges);
    expect(out.find((n) => n.id === "t")!.position).toEqual({ x: 0, y: 0 });
    expect(out.find((n) => n.id === "a1")!.position).toEqual({ x: 0, y: 120 });
    expect(out.find((n) => n.id === "a2")!.position).toEqual({ x: 0, y: 240 });
  });

  it("produces a non-overlapping layout for a branch (siblings fan into columns)", () => {
    const nodes = [node("t", "trigger", 0, 0), node("a", "action", 0, 0), node("b", "action", 0, 0)];
    const edges = [edge("e1", "t", "a"), edge("e2", "t", "b")];
    const out = layoutWorkflowGraph(nodes, edges);
    const positions = out.map((n) => n.position);
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        expect(positionsOverlap(positions[i]!, positions[j]!)).toBe(false);
      }
    }
    // Trigger on row 0; the two children share row 1 in adjacent columns.
    expect(out.find((n) => n.id === "t")!.position).toEqual({ x: 0, y: 0 });
    expect(out.find((n) => n.id === "a")!.position).toEqual({ x: 0, y: 120 });
    expect(out.find((n) => n.id === "b")!.position).toEqual({ x: LAYOUT_BRANCH_GAP_X, y: 120 });
  });

  it("stacks disconnected components vertically without overlap", () => {
    const nodes = [
      node("t", "trigger", 0, 0),
      node("a", "action", 0, 0),
      node("s", "action", 0, 0), // disconnected standalone
    ];
    const edges = [edge("e1", "t", "a")];
    const out = layoutWorkflowGraph(nodes, edges);
    const positions = out.map((n) => n.position);
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        expect(positionsOverlap(positions[i]!, positions[j]!)).toBe(false);
      }
    }
    // Standalone stacks below the first component (rows 0,1 → next component row 3).
    expect(out.find((n) => n.id === "s")!.position.y).toBeGreaterThan(
      out.find((n) => n.id === "a")!.position.y,
    );
  });

  it("returns already-tidy nodes by reference (no-op detection) and handles empty input", () => {
    expect(layoutWorkflowGraph([], [])).toEqual([]);
    const nodes = [node("t", "trigger", 0, 0), node("a1", "action", 0, 120)];
    const edges = [edge("e1", "t", "a1")];
    const out = layoutWorkflowGraph(nodes, edges);
    expect(out[0]).toBe(nodes[0]);
    expect(out[1]).toBe(nodes[1]);
  });
});
