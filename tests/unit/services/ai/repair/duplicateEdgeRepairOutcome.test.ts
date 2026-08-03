/** @jest-environment node */
/**
 * Tests for buildDuplicateEdgeRepairOutcome — Slice 4.AI-REPAIR-COVERAGE-2.
 *
 * The deterministic strategy proposes a `removeEdge` op for every REDUNDANT duplicate edge
 * (a later member of an identical `(from, to, label ?? "")` group), keeping the first; or
 * null when there are none (so the caller falls through). It never deletes a node, adds an
 * endpoint, changes a branch label, or touches a distinct-branch edge.
 */

import { buildDuplicateEdgeRepairOutcome } from "@/services/ai/repair/repairStrategies";
import type { WorkflowGraphView } from "@/services/ai/tools/workflowContext";

function graph(edges: { id: string; from: string; to: string; label?: string }[]): WorkflowGraphView {
  return {
    workflowId: "wf-1",
    updatedAt: "2026-06-17T00:00:00.000Z",
    nodes: [
      { id: "n1", kind: "trigger", provider: "native", type: "manual.run", config: {} },
      { id: "n2", kind: "action", provider: "native", type: "http_request", config: {} },
      { id: "n3", kind: "action", provider: "native", type: "http_request", config: {} },
    ],
    edges,
  } as unknown as WorkflowGraphView;
}

describe("buildDuplicateEdgeRepairOutcome", () => {
  it("returns null when there are no duplicate edges", () => {
    expect(
      buildDuplicateEdgeRepairOutcome(graph([{ id: "e1", from: "n1", to: "n2" }])),
    ).toBeNull();
  });

  it("returns null for same from/to with different labels (distinct branches)", () => {
    expect(
      buildDuplicateEdgeRepairOutcome(
        graph([
          { id: "e1", from: "n1", to: "n2", label: "yes" },
          { id: "e2", from: "n1", to: "n2", label: "no" },
        ]),
      ),
    ).toBeNull();
  });

  it("proposes one removeEdge op for a single redundant duplicate (keep-first)", () => {
    const outcome = buildDuplicateEdgeRepairOutcome(
      graph([
        { id: "e1", from: "n1", to: "n2" },
        { id: "e2", from: "n1", to: "n2" },
      ]),
    );
    expect(outcome).not.toBeNull();
    expect(outcome!.repairability).toBe("repairable");
    expect(outcome!.operations).toEqual([{ op: "removeEdge", edgeId: "e2" }]);
    expect(outcome!.requiredUserInput).toEqual([]);
  });

  it("proposes a removeEdge op for EVERY redundant copy (batch), keeping the first + leaving distinct branches alone", () => {
    const outcome = buildDuplicateEdgeRepairOutcome(
      graph([
        { id: "e1", from: "n1", to: "n2" },
        { id: "e2", from: "n1", to: "n2" }, // dup of e1
        { id: "e3", from: "n2", to: "n3", label: "x" },
        { id: "e4", from: "n2", to: "n3", label: "x" }, // dup of e3
        { id: "e5", from: "n2", to: "n3", label: "y" }, // distinct branch — kept
      ]),
    );
    expect(outcome!.operations).toEqual([
      { op: "removeEdge", edgeId: "e2" },
      { op: "removeEdge", edgeId: "e4" },
    ]);
    // Only removeEdge ops — never a node deletion or a new endpoint.
    expect(outcome!.operations.every((o) => o.op === "removeEdge")).toBe(true);
  });
});
