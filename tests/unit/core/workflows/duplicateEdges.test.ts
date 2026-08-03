/** @jest-environment node */
/**
 * Tests for core/workflows/duplicateEdges — Slice 4.AI-REPAIR-COVERAGE-2.
 *
 * `findDuplicateEdges` detects REDUNDANT duplicate edges — later edges identical to an
 * earlier one by the graph's own edge-identity key `(from, to, label ?? "")`. It keeps the
 * FIRST of each identical group and returns every later copy. Pure; diagnosis-only (it is
 * deliberately NOT part of the shared runtime validator `findGraphIssues`, so it never
 * changes the engine's `runnable` / the Activate gate).
 *
 * CRITICAL: edges with the same (from, to) but DIFFERENT `label` are distinct branches and
 * must NEVER be flagged (the dedup key includes `label`).
 */

import { findDuplicateEdges } from "@/core/workflows/duplicateEdges";
import type { WorkflowEdge } from "@/contracts/workflow";

const edge = (id: string, from: string, to: string, label?: string): WorkflowEdge =>
  label === undefined ? { id, from, to } : { id, from, to, label };

describe("findDuplicateEdges", () => {
  it("returns an empty list when there are no edges", () => {
    expect(findDuplicateEdges([])).toEqual([]);
  });

  it("returns an empty list when every edge is distinct", () => {
    expect(
      findDuplicateEdges([edge("e1", "a", "b"), edge("e2", "b", "c"), edge("e3", "a", "c")]),
    ).toEqual([]);
  });

  it("flags a duplicate of two UNLABELED edges (same from/to), keeping the first", () => {
    expect(
      findDuplicateEdges([edge("e1", "a", "b"), edge("e2", "a", "b")]),
    ).toEqual([{ edgeId: "e2", fromNodeId: "a", toNodeId: "b" }]);
  });

  it("flags a duplicate of two IDENTICAL-LABEL edges (same from/to/label), keeping the first", () => {
    expect(
      findDuplicateEdges([edge("e1", "a", "b", "yes"), edge("e2", "a", "b", "yes")]),
    ).toEqual([{ edgeId: "e2", fromNodeId: "a", toNodeId: "b" }]);
  });

  it("does NOT flag same from/to with DIFFERENT labels (distinct branches)", () => {
    expect(
      findDuplicateEdges([edge("e1", "a", "b", "yes"), edge("e2", "a", "b", "no")]),
    ).toEqual([]);
  });

  it("does NOT flag one labeled + one unlabeled edge between the same from/to (distinct keys)", () => {
    expect(
      findDuplicateEdges([edge("e1", "a", "b", "yes"), edge("e2", "a", "b")]),
    ).toEqual([]);
  });

  it("does NOT flag same-labeled edges from one source to DIFFERENT targets (router fan-out)", () => {
    expect(
      findDuplicateEdges([edge("e1", "a", "b", "match"), edge("e2", "a", "c", "match")]),
    ).toEqual([]);
  });

  it("keep-first is source-order stable across multiple copies of one group", () => {
    expect(
      findDuplicateEdges([
        edge("e1", "a", "b"),
        edge("e2", "a", "b"),
        edge("e3", "a", "b"),
      ]),
    ).toEqual([
      { edgeId: "e2", fromNodeId: "a", toNodeId: "b" },
      { edgeId: "e3", fromNodeId: "a", toNodeId: "b" },
    ]);
  });

  it("handles several independent duplicate groups, keeping the first of each", () => {
    expect(
      findDuplicateEdges([
        edge("e1", "a", "b"),
        edge("e2", "a", "b"), // dup of e1
        edge("e3", "c", "d", "x"),
        edge("e4", "c", "d", "x"), // dup of e3
        edge("e5", "c", "d", "y"), // distinct branch — NOT a dup
      ]),
    ).toEqual([
      { edgeId: "e2", fromNodeId: "a", toNodeId: "b" },
      { edgeId: "e4", fromNodeId: "c", toNodeId: "d" },
    ]);
  });
});
