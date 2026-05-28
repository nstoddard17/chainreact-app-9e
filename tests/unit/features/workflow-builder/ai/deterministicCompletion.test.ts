/**
 * @jest-environment node
 *
 * Slice 4.AI-35B — pure eligibility decision for deterministic required-input
 * completion. Decides whether a follow-up can skip the model (drop staged
 * answers into known fields) or must re-plan.
 */
import { evaluateDeterministicCompletion } from "@/features/workflow-builder/ai/deterministicCompletion";
import type { RequiredInputAnswer } from "@/features/workflow-builder/ai";
import type { AiPlanResult, AiRequiredUserInput } from "@/lib/api/ai";

function planWith(requiredUserInput: AiRequiredUserInput[]): AiPlanResult {
  return {
    ok: true,
    intentSummary: "x",
    assumptions: [],
    requiredUserInput,
    unsupportedRequests: [],
    safetyNotes: [],
    proposedPatch: { patchId: "p1", operations: [] },
    canApplyLater: false,
    model: { modelId: "m", tier: "strong", feature: "creation" },
  };
}

function answer(nodeId: string, field: string, value: string): RequiredInputAnswer {
  return {
    key: `${nodeId}::${field}`,
    display: value,
    value,
    descriptor: { label: field, kind: "config_value", nodeId, field },
  };
}

describe("evaluateDeterministicCompletion", () => {
  it("deterministic when every blocking config_value has a matching staged answer", () => {
    const plan = planWith([
      { label: "Channel", kind: "config_value", nodeId: "n1", field: "channel" },
      { label: "Text", kind: "config_value", nodeId: "n1", field: "text" },
    ]);
    const decision = evaluateDeterministicCompletion(
      plan,
      [answer("n1", "channel", "C123"), answer("n1", "text", "hi")],
      "",
    );
    expect(decision.mode).toBe("deterministic");
    if (decision.mode !== "deterministic") return;
    expect(decision.answers).toEqual([
      { nodeId: "n1", field: "channel", value: "C123" },
      { nodeId: "n1", field: "text", value: "hi" },
    ]);
  });

  it("model_replan when the user typed free text (may be a new instruction)", () => {
    const plan = planWith([{ label: "Text", kind: "config_value", nodeId: "n1", field: "text" }]);
    const decision = evaluateDeterministicCompletion(plan, [answer("n1", "text", "hi")], "also CC my boss");
    expect(decision).toEqual({ mode: "model_replan", reason: "free_text_present" });
  });

  it("model_replan for a provider_choice (resolving it changes the trigger/action shape)", () => {
    const plan = planWith([
      { label: "Which email app?", kind: "provider_choice", category: "email", options: [{ label: "Gmail", value: "gmail" }] },
    ]);
    const decision = evaluateDeterministicCompletion(
      plan,
      [{ key: "label::Which email app?", display: "Gmail", value: "gmail", descriptor: { label: "Which email app?", kind: "provider_choice", category: "email" } }],
      "",
    );
    expect(decision).toEqual({ mode: "model_replan", reason: "provider_choice_requires_replan" });
  });

  it("model_replan when a blocking field has no staged answer", () => {
    const plan = planWith([
      { label: "Channel", kind: "config_value", nodeId: "n1", field: "channel" },
      { label: "Text", kind: "config_value", nodeId: "n1", field: "text" },
    ]);
    const decision = evaluateDeterministicCompletion(plan, [answer("n1", "channel", "C123")], "");
    expect(decision).toEqual({ mode: "model_replan", reason: "missing_answer" });
  });

  it("model_replan for a multi-select field (not a simple single-value fill)", () => {
    const plan = planWith([
      { label: "Events", kind: "config_value", nodeId: "n1", field: "events", multiple: true },
    ]);
    const decision = evaluateDeterministicCompletion(plan, [answer("n1", "events", "a")], "");
    expect(decision).toEqual({ mode: "model_replan", reason: "multi_value_field" });
  });

  it("select_integration entries are non-blocking and don't force a re-plan", () => {
    const plan = planWith([
      { label: "Connect Stripe", kind: "select_integration" },
      { label: "Text", kind: "config_value", nodeId: "n1", field: "text" },
    ]);
    const decision = evaluateDeterministicCompletion(plan, [answer("n1", "text", "hi")], "");
    expect(decision.mode).toBe("deterministic");
  });

  it("model_replan when the plan failed / is null", () => {
    expect(evaluateDeterministicCompletion(null, [], "").mode).toBe("model_replan");
    const fail: AiPlanResult = { ok: false, code: "MODEL_FAILED", message: "x", errors: [] };
    expect(evaluateDeterministicCompletion(fail, [], "").mode).toBe("model_replan");
  });
});
