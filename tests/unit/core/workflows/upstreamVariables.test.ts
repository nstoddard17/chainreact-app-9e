/**
 * @jest-environment node
 *
 * Tests for core/workflows/upstreamVariables — Slice 3.7.
 *
 * Pure graph-topology helper. Critical contracts:
 *   - Strict ancestors only: never includes currentNodeId itself,
 *     never includes downstream.
 *   - Cycle-safe (WorkflowDefinitionSchema does not enforce DAG).
 *   - Returns [] for unknown currentNodeId rather than throwing.
 */

import type { WorkflowEdge, WorkflowNode } from "@/contracts/workflow";
import { findUpstreamNodes } from "@/core/workflows/upstreamVariables";

function node(id: string, kind: "trigger" | "action" = "action"): WorkflowNode {
  return {
    id,
    kind,
    provider: "native",
    type: "http_request",
    config: {},
    position: { x: 0, y: 0 },
  };
}

function edge(from: string, to: string): WorkflowEdge {
  return { id: `${from}->${to}`, from, to };
}

describe("findUpstreamNodes", () => {
  it("returns [] when current node is not in the graph", () => {
    expect(
      findUpstreamNodes({
        currentNodeId: "ghost",
        nodes: [node("a"), node("b")],
        edges: [edge("a", "b")],
      }),
    ).toEqual([]);
  });

  it("returns [] when the current node has no incoming edges", () => {
    expect(
      findUpstreamNodes({
        currentNodeId: "a",
        nodes: [node("a"), node("b")],
        edges: [edge("a", "b")],
      }),
    ).toEqual([]);
  });

  it("returns the single direct parent", () => {
    expect(
      findUpstreamNodes({
        currentNodeId: "b",
        nodes: [node("a"), node("b")],
        edges: [edge("a", "b")],
      }),
    ).toEqual(["a"]);
  });

  it("returns all transitive ancestors (a → b → c → d, querying d)", () => {
    const result = findUpstreamNodes({
      currentNodeId: "d",
      nodes: [node("a"), node("b"), node("c"), node("d")],
      edges: [edge("a", "b"), edge("b", "c"), edge("c", "d")],
    });
    expect([...result].sort()).toEqual(["a", "b", "c"]);
  });

  it("excludes the current node itself", () => {
    const result = findUpstreamNodes({
      currentNodeId: "c",
      nodes: [node("a"), node("b"), node("c")],
      edges: [edge("a", "b"), edge("b", "c")],
    });
    expect(result).not.toContain("c");
  });

  it("excludes downstream siblings (b sibling of c via a → b, a → c; query b)", () => {
    const result = findUpstreamNodes({
      currentNodeId: "b",
      nodes: [node("a"), node("b"), node("c")],
      edges: [edge("a", "b"), edge("a", "c")],
    });
    expect(result).toEqual(["a"]);
    expect(result).not.toContain("c");
  });

  it("handles diamond DAG (a → b → d, a → c → d; query d)", () => {
    const result = findUpstreamNodes({
      currentNodeId: "d",
      nodes: [node("a"), node("b"), node("c"), node("d")],
      edges: [
        edge("a", "b"),
        edge("a", "c"),
        edge("b", "d"),
        edge("c", "d"),
      ],
    });
    expect([...result].sort()).toEqual(["a", "b", "c"]);
  });

  it("does not re-include the same ancestor twice (idempotent BFS)", () => {
    const result = findUpstreamNodes({
      currentNodeId: "d",
      nodes: [node("a"), node("b"), node("c"), node("d")],
      edges: [
        edge("a", "b"),
        edge("a", "c"),
        edge("b", "d"),
        edge("c", "d"),
      ],
    });
    const unique = [...new Set(result)];
    expect(result.length).toBe(unique.length);
  });

  it("terminates on a cycle (a → b → c → a; query a)", () => {
    // Cycle that includes the current node: ancestors should not
    // include the current node itself even though the cycle technically
    // reaches it.
    const result = findUpstreamNodes({
      currentNodeId: "a",
      nodes: [node("a"), node("b"), node("c")],
      edges: [edge("a", "b"), edge("b", "c"), edge("c", "a")],
    });
    expect(result).not.toContain("a");
    expect([...result].sort()).toEqual(["b", "c"]);
  });

  it("terminates on a cycle that does not include the current node (b → c → b; query a → b)", () => {
    const result = findUpstreamNodes({
      currentNodeId: "downstream",
      nodes: [
        node("a"),
        node("b"),
        node("c"),
        node("downstream"),
      ],
      edges: [
        edge("a", "b"),
        edge("b", "c"),
        edge("c", "b"), // cycle
        edge("c", "downstream"),
      ],
    });
    expect([...result].sort()).toEqual(["a", "b", "c"]);
  });

  it("ignores edges that reference unknown nodes (defensive)", () => {
    const result = findUpstreamNodes({
      currentNodeId: "b",
      nodes: [node("a"), node("b")],
      edges: [
        edge("a", "b"),
        edge("ghost", "b"), // unknown source
        edge("b", "phantom"), // unknown target — also ignored
      ],
    });
    expect(result).toEqual(["a"]);
  });

  it("handles a trigger as the only upstream source", () => {
    const trig = node("trig", "trigger");
    const act = node("act", "action");
    expect(
      findUpstreamNodes({
        currentNodeId: "act",
        nodes: [trig, act],
        edges: [edge("trig", "act")],
      }),
    ).toEqual(["trig"]);
  });
});
