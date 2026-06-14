/**
 * Tests for CHECK-ACTIONS-2 — `attentionFindingCards`, the pure classifier behind the
 * "Needs attention" group on the Check workflow card.
 *
 * Proves: only `source: "graph"` and `source: "run"` findings become attention cards
 * (field/connection are owned by the input/setup groups); each maps to friendly
 * guidance with NO raw code/id; finding order + severity are preserved.
 */
import { attentionFindingCards } from "@/features/workflow-builder/ai/attentionFindings";
import type { AgentWorkflowDiagnosis } from "@/lib/api/ai";

const f = (source: string, code: string, severity = "error") => ({ source, code, severity, title: "x" });
const dx = (findings: unknown[]): AgentWorkflowDiagnosis =>
  ({ workflowId: "w", access: "OK", findings } as never);

describe("attentionFindingCards — selection", () => {
  it("returns [] for null / no findings", () => {
    expect(attentionFindingCards(null)).toEqual([]);
    expect(attentionFindingCards(dx([]))).toEqual([]);
  });

  it("ignores field + connection findings (owned by other groups)", () => {
    expect(
      attentionFindingCards(
        dx([
          f("field", "MISSING_REQUIRED_FIELD"),
          f("connection", "RECONNECT_REQUIRED"),
        ]),
      ),
    ).toEqual([]);
  });

  it("selects graph + run findings, in finding order", () => {
    const cards = attentionFindingCards(
      dx([f("graph", "no_trigger"), f("run", "RECENT_RUN_FAILED", "warning")]),
    );
    expect(cards).toHaveLength(2);
    expect(cards[0]!.message).toContain("trigger");
    expect(cards[1]!.message).toContain("run failed");
  });
});

describe("attentionFindingCards — copy + no-leak", () => {
  it.each([
    ["no_trigger", "starting point"],
    ["unreachable_node", "Connect every step"],
    ["empty_workflow", "trigger and at least one action"],
    ["some_other_graph_code", "structure"],
  ])("graph %s → friendly guidance containing '%s'", (code, fragment) => {
    const [card] = attentionFindingCards(dx([f("graph", code)]));
    expect(card!.message).toContain(fragment);
    expect(card!.message).not.toContain(code);
  });

  it("run finding renders generic guidance, never the raw code", () => {
    const [card] = attentionFindingCards(dx([f("run", "RECENT_RUN_FAILED", "warning")]));
    expect(card!.message).not.toContain("RECENT_RUN_FAILED");
    expect(card!.severity).toBe("warning");
  });

  it("carries graph severity through as error", () => {
    expect(attentionFindingCards(dx([f("graph", "no_trigger")]))[0]!.severity).toBe("error");
  });
});
