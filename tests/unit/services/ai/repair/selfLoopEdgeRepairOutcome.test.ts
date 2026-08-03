/** @jest-environment node */
/**
 * Tests for buildSelfLoopEdgeRepairOutcome — Slice 4.AI-REPAIR-COVERAGE-1.
 *
 * The deterministic strategy proposes a `removeEdge` op for every self-loop edge
 * (`from === to`), or null when there are none (so the caller falls through). It never
 * deletes a node, adds an endpoint, or touches anything but the self-loop edges.
 */

import { buildSelfLoopEdgeRepairOutcome } from "@/services/ai/repair/repairStrategies";
import type { WorkflowGraphView } from "@/services/ai/tools/workflowContext";

function graph(edges: { id: string; from: string; to: string }[]): WorkflowGraphView {
  return {
    workflowId: "wf-1",
    updatedAt: "2026-06-16T00:00:00.000Z",
    nodes: [
      { id: "n1", kind: "trigger", provider: "native", type: "manual.run", config: {} },
      { id: "n2", kind: "action", provider: "native", type: "http_request", config: {} },
    ],
    edges,
  } as unknown as WorkflowGraphView;
}

describe("buildSelfLoopEdgeRepairOutcome", () => {
  it("returns null when there are no self-loop edges", () => {
    expect(buildSelfLoopEdgeRepairOutcome(graph([{ id: "e1", from: "n1", to: "n2" }]))).toBeNull();
  });

  it("proposes one removeEdge op for a single self-loop", () => {
    const outcome = buildSelfLoopEdgeRepairOutcome(
      graph([
        { id: "e1", from: "n1", to: "n2" },
        { id: "e2", from: "n2", to: "n2" },
      ]),
    );
    expect(outcome).not.toBeNull();
    expect(outcome!.repairability).toBe("repairable");
    expect(outcome!.operations).toEqual([{ op: "removeEdge", edgeId: "e2" }]);
    expect(outcome!.requiredUserInput).toEqual([]);
  });

  it("proposes a removeEdge op for EVERY self-loop (batch), leaving normal edges alone", () => {
    const outcome = buildSelfLoopEdgeRepairOutcome(
      graph([
        { id: "e1", from: "n1", to: "n1" },
        { id: "e2", from: "n1", to: "n2" },
        { id: "e3", from: "n2", to: "n2" },
      ]),
    );
    expect(outcome!.operations).toEqual([
      { op: "removeEdge", edgeId: "e1" },
      { op: "removeEdge", edgeId: "e3" },
    ]);
    // Only removeEdge ops — never a node deletion or a new endpoint.
    expect(outcome!.operations.every((o) => o.op === "removeEdge")).toBe(true);
  });
});
