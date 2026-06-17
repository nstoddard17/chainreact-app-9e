/**
 * Tests for duplicateEdgeCards — Slice 4.AI-REPAIR-COVERAGE-2.
 *
 * Derives the actionable "Needs attention" duplicate-edge card from a safe diagnosis DTO.
 * No-leak: the card carries ONLY the server-built safe endpoint step labels + a count-aware
 * headline — never a raw node/edge id or branch label. The generic structural-card helper
 * must EXCLUDE DUPLICATE_EDGE (it renders via this actionable card instead).
 */

import {
  attentionFindingCards,
  duplicateEdgeCards,
} from "@/features/workflow-builder/ai/attentionFindings";
import type { AgentWorkflowDiagnosis } from "@/lib/api/ai";

function diag(findings: AgentWorkflowDiagnosis["findings"]): AgentWorkflowDiagnosis {
  return { workflowId: "wf-1", access: "OK", overallReady: false, findings };
}

describe("duplicateEdgeCards", () => {
  it("returns no cards when there is no duplicate-edge finding", () => {
    expect(
      duplicateEdgeCards(diag([{ source: "graph", code: "no_trigger", severity: "error", title: "x" }])),
    ).toEqual([]);
  });

  it("builds a singular card with the safe endpoint labels (no raw ids/labels)", () => {
    const cards = duplicateEdgeCards(
      diag([
        {
          source: "graph",
          code: "DUPLICATE_EDGE",
          severity: "error",
          title: "Two steps are connected more than once.",
          duplicateConnections: [{ fromLabel: "Trigger", toLabel: "Send Email" }],
        },
      ]),
    );
    expect(cards).toHaveLength(1);
    expect(cards[0]!.message).toBe("Two steps in this workflow are connected more than once.");
    expect(cards[0]!.connections).toEqual([{ fromLabel: "Trigger", toLabel: "Send Email" }]);
  });

  it("uses a count-aware plural headline for multiple duplicate connections", () => {
    const cards = duplicateEdgeCards(
      diag([
        {
          source: "graph",
          code: "DUPLICATE_EDGE",
          severity: "error",
          title: "Two steps are connected more than once.",
          duplicateConnections: [
            { fromLabel: "A", toLabel: "B" },
            { fromLabel: "C", toLabel: "D" },
          ],
        },
      ]),
    );
    expect(cards[0]!.message).toBe("2 duplicate connections were found between steps.");
  });

  it("never carries a raw node/edge id or branch label into the card", () => {
    const cards = duplicateEdgeCards(
      diag([
        {
          source: "graph",
          code: "DUPLICATE_EDGE",
          severity: "error",
          title: "x",
          // The server-built finding only ever holds safe labels; assert the card stays clean
          // even if internal-looking strings somehow appeared as labels.
          duplicateConnections: [{ fromLabel: "First Step", toLabel: "Second Step" }],
        },
      ]),
    );
    const serialized = JSON.stringify(cards[0]);
    expect(serialized).not.toContain("node-");
    expect(serialized).not.toContain("edge-");
    // The branch grouping label (e.g. "yes"/"no") is never part of the card payload.
    expect(serialized).not.toContain("label");
  });

  it("is EXCLUDED from the generic structural-card helper (renders as an actionable card)", () => {
    const d = diag([
      {
        source: "graph",
        code: "DUPLICATE_EDGE",
        severity: "error",
        title: "x",
        duplicateConnections: [{ fromLabel: "A", toLabel: "B" }],
      },
    ]);
    expect(attentionFindingCards(d)).toEqual([]);
    expect(duplicateEdgeCards(d)).toHaveLength(1);
  });
});
