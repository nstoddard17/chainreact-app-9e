/** @jest-environment node */
/**
 * Tests for core/workflows/selfLoopEdges — Slice 4.AI-REPAIR-COVERAGE-1.
 *
 * `findSelfLoopEdges` detects edges whose `from === to` (a step wired to itself).
 * Pure; diagnosis-only (it is deliberately NOT part of the shared runtime validator
 * `findGraphIssues`, so it never changes the engine's `runnable` / the Activate gate).
 */

import { findSelfLoopEdges } from "@/core/workflows/selfLoopEdges";
import type { WorkflowEdge } from "@/contracts/workflow";

const edge = (id: string, from: string, to: string): WorkflowEdge => ({ id, from, to });

describe("findSelfLoopEdges", () => {
  it("returns an empty list when there are no self-loops", () => {
    expect(findSelfLoopEdges([edge("e1", "a", "b"), edge("e2", "b", "c")])).toEqual([]);
  });

  it("detects a single self-loop with its edge + node id", () => {
    expect(findSelfLoopEdges([edge("e1", "a", "b"), edge("e2", "n", "n")])).toEqual([
      { edgeId: "e2", nodeId: "n" },
    ]);
  });

  it("detects every self-loop in source order", () => {
    const result = findSelfLoopEdges([
      edge("e1", "x", "x"),
      edge("e2", "a", "b"),
      edge("e3", "y", "y"),
    ]);
    expect(result).toEqual([
      { edgeId: "e1", nodeId: "x" },
      { edgeId: "e3", nodeId: "y" },
    ]);
  });

  it("returns an empty list for no edges", () => {
    expect(findSelfLoopEdges([])).toEqual([]);
  });
});
