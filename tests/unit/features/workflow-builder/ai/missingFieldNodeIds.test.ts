/**
 * Tests for AI-CONFIG-ASSIST CS-8 pure helper (missingFieldNodeIds) +
 * CS-4 firstMissingFieldNodeId, derived from the safe diagnosis DTO.
 *
 * `missingFieldNodeIds` returns ALL distinct missing-required-field node ids in
 * finding order; `firstMissingFieldNodeId` returns the first (or null). Only
 * MISSING_REQUIRED_FIELD findings with node ids count — connection / graph / run
 * findings never produce an open-field target.
 */
import {
  firstMissingFieldNodeId,
  missingFieldNodeIds,
} from "@/features/workflow-builder/ai/firstMissingFieldNodeId";

const dx = (findings: unknown[]) =>
  ({ workflowId: "w", access: "OK", findings } as never);

describe("missingFieldNodeIds", () => {
  it("returns [] for null / no findings", () => {
    expect(missingFieldNodeIds(null)).toEqual([]);
    expect(missingFieldNodeIds(undefined)).toEqual([]);
    expect(missingFieldNodeIds(dx([]))).toEqual([]);
  });

  it("collects distinct nodes across multiple missing-field findings, in order", () => {
    const d = dx([
      { source: "field", code: "MISSING_REQUIRED_FIELD", severity: "error", title: "x", nodeIds: ["A"] },
      { source: "field", code: "MISSING_REQUIRED_FIELD", severity: "error", title: "x", nodeIds: ["B"] },
    ]);
    expect(missingFieldNodeIds(d)).toEqual(["A", "B"]);
  });

  it("de-duplicates repeated node ids", () => {
    const d = dx([
      { source: "field", code: "MISSING_REQUIRED_FIELD", severity: "error", title: "x", nodeIds: ["A"] },
      { source: "field", code: "MISSING_REQUIRED_FIELD", severity: "error", title: "x", nodeIds: ["A", "B"] },
    ]);
    expect(missingFieldNodeIds(d)).toEqual(["A", "B"]);
  });

  it("ignores non-missing-field findings (connection / graph / run)", () => {
    const d = dx([
      { source: "connection", code: "DISCONNECTED", severity: "error", title: "x", nodeIds: ["S"] },
      { source: "graph", code: "no_trigger", severity: "error", title: "x" },
      { source: "run", code: "RECENT_RUN_FAILED", severity: "warning", title: "x", nodeIds: ["R"] },
      { source: "field", code: "MISSING_REQUIRED_FIELD", severity: "error", title: "x", nodeIds: ["A"] },
    ]);
    expect(missingFieldNodeIds(d)).toEqual(["A"]);
  });

  it("firstMissingFieldNodeId returns the first node id, or null", () => {
    expect(firstMissingFieldNodeId(dx([
      { source: "field", code: "MISSING_REQUIRED_FIELD", severity: "error", title: "x", nodeIds: ["A", "B"] },
    ]))).toBe("A");
    expect(firstMissingFieldNodeId(dx([
      { source: "connection", code: "DISCONNECTED", severity: "error", title: "x" },
    ]))).toBeNull();
  });
});
