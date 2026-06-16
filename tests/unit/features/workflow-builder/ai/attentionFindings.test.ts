/**
 * Tests for CHECK-ACTIONS-2 — `attentionFindingCards`, the pure classifier behind the
 * "Needs attention" group on the Check workflow card.
 *
 * Proves: only `source: "graph"` and `source: "run"` findings become attention cards
 * (field/connection are owned by the input/setup groups); each maps to friendly
 * guidance with NO raw code/id; finding order + severity are preserved.
 */
import { attentionFindingCards, invalidReferenceCards } from "@/features/workflow-builder/ai/attentionFindings";
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

describe("invalidReferenceCards — actionable invalid-reference cards (AI-REPAIR-3I)", () => {
  const refFinding = (refs: unknown[]) =>
    dx([
      {
        source: "graph",
        code: "INVALID_VARIABLE_REFERENCE",
        severity: "error",
        title: "x",
        nodeIds: ["slack-1"],
        invalidReferences: refs,
      },
    ]);

  it("invalid-reference findings are NOT returned by attentionFindingCards (they're actionable)", () => {
    const d = refFinding([{ fieldLabel: "Message", token: "{{ghost.to}}", fieldKey: "message", replacementReason: "none" }]);
    expect(attentionFindingCards(d)).toEqual([]); // moved to invalidReferenceCards
  });

  it("zero candidates → 'choose a valid variable or remove' guidance + nav targets (not rendered)", () => {
    const cards = invalidReferenceCards(
      refFinding([{ fieldLabel: "Message", token: "{{ghost.to}}", fieldKey: "message", replacementReason: "none" }]),
    );
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ nodeId: "slack-1", fieldKey: "message", fieldLabel: "Message" });
    expect(cards[0]!.message).toContain("Message");
    expect(cards[0]!.message).toContain("choose a valid variable or remove");
    // No-leak: the raw field key / node id never appear in the user-facing message.
    expect(cards[0]!.message).not.toContain("slack-1");
  });

  it("multiple candidates → manual-choice guidance", () => {
    const cards = invalidReferenceCards(
      refFinding([{ fieldLabel: "Message", token: "{{ghost.to}}", fieldKey: "message", replacementReason: "multiple" }]),
    );
    expect(cards[0]!.message).toContain("More than one replacement");
    expect(cards[0]!.message).toContain("choose the correct variable manually");
  });

  it("one candidate → 'found one safe replacement' copy + carries replacementReason 'one' (AI-REPAIR-3K)", () => {
    const cards = invalidReferenceCards(
      refFinding([{ fieldLabel: "Message", token: "{{ghost.to}}", fieldKey: "message", replacementReason: "one" }]),
    );
    expect(cards[0]!.message).toContain("found one safe replacement");
    // The reason rides on the card so the UI can offer a direct "Preview fix".
    expect(cards[0]!.replacementReason).toBe("one");
    // No-leak: still field LABEL only — never the raw key / node id / token.
    expect(cards[0]!.message).not.toContain("message");
    expect(cards[0]!.message).not.toContain("ghost");
  });

  it("multiple candidates with options → carries the candidate list through (AI-REPAIR-3L)", () => {
    const cards = invalidReferenceCards(
      refFinding([
        {
          fieldLabel: "Message",
          token: "{{ghost.to}}",
          fieldKey: "text",
          replacementReason: "multiple",
          candidates: [
            { reference: "{{a.to}}", label: "to — from Step A" },
            { reference: "{{b.to}}", label: "to — from Step B" },
          ],
        },
      ]),
    );
    expect(cards[0]!.candidates).toHaveLength(2);
    expect(cards[0]!.candidates![0]).toEqual({ reference: "{{a.to}}", label: "to — from Step A" });
  });

  it("multiple candidates WITHOUT options (sensitive field) → no candidates key", () => {
    const cards = invalidReferenceCards(
      refFinding([{ fieldLabel: "To", token: "{{ghost.to}}", fieldKey: "to", replacementReason: "multiple" }]),
    );
    expect(cards[0]!.candidates).toBeUndefined();
  });

  it("missing reason → safe generic guidance", () => {
    const cards = invalidReferenceCards(
      refFinding([{ fieldLabel: "Message", token: "{{ghost.to}}", fieldKey: "message" }]),
    );
    expect(cards[0]!.message).toContain("choose a valid variable or remove");
  });

  it("skips a ref missing its navigation key (e.g. a pre-3I rehydrated diagnosis)", () => {
    const cards = invalidReferenceCards(refFinding([{ fieldLabel: "Message", token: "{{ghost.to}}" }]));
    expect(cards).toEqual([]);
  });

  it("returns [] when there are no invalid-reference findings", () => {
    expect(invalidReferenceCards(dx([f("graph", "no_trigger")]))).toEqual([]);
  });
});
