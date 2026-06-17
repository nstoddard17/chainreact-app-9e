/**
 * Tests for selfLoopEdgeCards — Slice 4.AI-REPAIR-COVERAGE-1.
 *
 * Derives the actionable "Needs attention" self-loop-edge card from a safe diagnosis DTO.
 * No-leak: the card carries ONLY the server-built safe step labels + a count-aware headline
 * — never a raw node/edge id. The generic structural-card helper must EXCLUDE SELF_LOOP_EDGE
 * (it renders via this actionable card instead).
 */

import {
  attentionFindingCards,
  selfLoopEdgeCards,
} from "@/features/workflow-builder/ai/attentionFindings";
import type { AgentWorkflowDiagnosis } from "@/lib/api/ai";

function diag(findings: AgentWorkflowDiagnosis["findings"]): AgentWorkflowDiagnosis {
  return { workflowId: "wf-1", access: "OK", overallReady: false, findings };
}

describe("selfLoopEdgeCards", () => {
  it("returns no cards when there is no self-loop finding", () => {
    expect(selfLoopEdgeCards(diag([{ source: "graph", code: "no_trigger", severity: "error", title: "x" }]))).toEqual([]);
  });

  it("builds a singular card with the safe step label (no raw ids)", () => {
    const cards = selfLoopEdgeCards(
      diag([
        {
          source: "graph",
          code: "SELF_LOOP_EDGE",
          severity: "error",
          title: "A step is connected to itself.",
          nodeIds: ["node-uuid-secret"],
          selfLoopNodeLabels: ["HTTP Request"],
        },
      ]),
    );
    expect(cards).toHaveLength(1);
    expect(cards[0]!.message).toBe("A step in this workflow is connected to itself.");
    expect(cards[0]!.steps).toEqual(["HTTP Request"]);
    // No-leak: the raw node id is NEVER carried into the card.
    expect(JSON.stringify(cards[0])).not.toContain("node-uuid-secret");
  });

  it("uses a count-aware plural headline for multiple self-loops", () => {
    const cards = selfLoopEdgeCards(
      diag([
        {
          source: "graph",
          code: "SELF_LOOP_EDGE",
          severity: "error",
          title: "A step is connected to itself.",
          selfLoopNodeLabels: ["Step A", "Step B"],
        },
      ]),
    );
    expect(cards[0]!.message).toBe("2 steps in this workflow are connected to themselves.");
  });

  it("is EXCLUDED from the generic structural-card helper (renders as an actionable card)", () => {
    const d = diag([
      { source: "graph", code: "SELF_LOOP_EDGE", severity: "error", title: "x", selfLoopNodeLabels: ["A"] },
    ]);
    expect(attentionFindingCards(d)).toEqual([]);
    expect(selfLoopEdgeCards(d)).toHaveLength(1);
  });
});
