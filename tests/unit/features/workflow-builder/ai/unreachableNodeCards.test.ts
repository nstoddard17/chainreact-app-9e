/**
 * Tests for unreachableNodeCards — Slice 4.AI-GUIDANCE-UNREACHABLE-NODE-1.
 *
 * Derives the GUIDANCE-ONLY "Needs attention" unreachable/orphan-node card from a safe
 * diagnosis DTO. There is NO deterministic fix — the card carries only a count-aware
 * explanation + safe step labels (the view adds static connect/move/delete suggestions).
 * No-leak: only the server-built safe labels — never a raw node id. The generic
 * structural-card helper must EXCLUDE `unreachable_node` (it renders via this card instead).
 */

import {
  attentionFindingCards,
  unreachableNodeCards,
} from "@/features/workflow-builder/ai/attentionFindings";
import type { AgentWorkflowDiagnosis } from "@/lib/api/ai";

function diag(findings: AgentWorkflowDiagnosis["findings"]): AgentWorkflowDiagnosis {
  return { workflowId: "wf-1", access: "OK", overallReady: false, findings };
}

const orphan = (label: string, nodeId: string) => ({
  source: "graph" as const,
  code: "unreachable_node",
  severity: "error" as const,
  title: "A node can't be reached from the trigger.",
  nodeIds: [nodeId],
  nodeLabels: [label],
});

describe("unreachableNodeCards", () => {
  it("returns no cards when there is no unreachable_node finding", () => {
    expect(unreachableNodeCards(diag([{ source: "graph", code: "no_trigger", severity: "error", title: "x" }]))).toEqual([]);
  });

  it("builds a singular card with the safe step label (no raw ids)", () => {
    const cards = unreachableNodeCards(diag([orphan("Send Email", "node-uuid-secret")]));
    expect(cards).toHaveLength(1);
    expect(cards[0]!.message).toBe(
      "A step in this workflow isn’t connected to the trigger, so it won’t run.",
    );
    expect(cards[0]!.steps).toEqual(["Send Email"]);
    // No-leak: the raw node id never reaches the card.
    expect(JSON.stringify(cards[0])).not.toContain("node-uuid-secret");
  });

  it("aggregates multiple unreachable_node findings into ONE count-aware card", () => {
    const cards = unreachableNodeCards(
      diag([orphan("Step A", "n-a"), orphan("Step B", "n-b"), orphan("Step C", "n-c")]),
    );
    expect(cards).toHaveLength(1);
    expect(cards[0]!.message).toBe(
      "3 steps in this workflow aren’t connected to the trigger, so they won’t run.",
    );
    expect(cards[0]!.steps).toEqual(["Step A", "Step B", "Step C"]);
    expect(JSON.stringify(cards[0])).not.toContain("n-a");
  });

  it("is EXCLUDED from the generic structural-card helper (renders via the guidance card)", () => {
    const d = diag([orphan("Send Email", "n1")]);
    // Generic helper no longer emits an unreachable_node item…
    expect(attentionFindingCards(d)).toEqual([]);
    // …and the dedicated guidance builder does.
    expect(unreachableNodeCards(d)).toHaveLength(1);
  });

  it("does not surface non-graph findings or other graph codes", () => {
    expect(
      unreachableNodeCards(
        diag([
          { source: "run", code: "unreachable_node", severity: "error", title: "x" },
          { source: "graph", code: "no_trigger", severity: "error", title: "x" },
        ]),
      ),
    ).toEqual([]);
  });
});
