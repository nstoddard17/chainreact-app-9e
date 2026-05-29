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

/** A staged answer for a BARE config_value entry (no nodeId/field) — keyed by label. */
function bareAnswer(label: string, value: string): RequiredInputAnswer {
  return {
    key: `label::${label}`,
    display: value,
    descriptor: { label, kind: "config_value" },
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

  // Slice 4.AI-35E — typed-scalar / array fields can't be filled with a raw
  // string by the completion route; the model must build the correctly-typed
  // config value. Deterministic stays valid for string-scalar renderers.
  it.each(["number", "boolean", "string-array", "file", "keyvalue"])(
    "model_replan for a non-string-scalar field type (%s)",
    (fieldType) => {
      const plan = planWith([
        { label: "X", kind: "config_value", nodeId: "n1", field: "x", fieldType },
      ]);
      const decision = evaluateDeterministicCompletion(plan, [answer("n1", "x", "v")], "");
      expect(decision).toEqual({ mode: "model_replan", reason: "non_string_field" });
    },
  );

  it.each(["text", "textarea", "select", "combobox", "cron"])(
    "deterministic for a string-scalar field type (%s)",
    (fieldType) => {
      const plan = planWith([
        { label: "X", kind: "config_value", nodeId: "n1", field: "x", fieldType },
      ]);
      const decision = evaluateDeterministicCompletion(plan, [answer("n1", "x", "v")], "");
      expect(decision.mode).toBe("deterministic");
    },
  );

  it("deterministic when fieldType is absent (legacy / bare config_value)", () => {
    const plan = planWith([{ label: "X", kind: "config_value", nodeId: "n1", field: "x" }]);
    const decision = evaluateDeterministicCompletion(plan, [answer("n1", "x", "v")], "");
    expect(decision.mode).toBe("deterministic");
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

  // ─── Slice 4.AI-35F — bare config_value answers (no node identity) ─────────
  it("deterministic for a BARE config_value when a proposedPatch exists (server infers the target)", () => {
    // The live regression: a null-patch-derived "What should the message say?"
    // has no nodeId/field, but the plan carries a proposedPatch. The answer is
    // forwarded UNTARGETED so the server maps it to the unique missing field.
    const plan = planWith([{ label: "What should the Slack DM say?", kind: "config_value" }]);
    const decision = evaluateDeterministicCompletion(
      plan,
      [bareAnswer("What should the Slack DM say?", "Hey")],
      "",
    );
    expect(decision.mode).toBe("deterministic");
    if (decision.mode !== "deterministic") return;
    expect(decision.answers).toEqual([{ value: "Hey" }]); // untargeted — no nodeId/field
  });

  it("model_replan (no_target_node) for a BARE config_value when there is NO proposedPatch to infer against", () => {
    const plan: AiPlanResult = {
      ok: true,
      intentSummary: "x",
      assumptions: [],
      requiredUserInput: [{ label: "What should it say?", kind: "config_value" }],
      unsupportedRequests: [],
      safetyNotes: [],
      // no proposedPatch
      canApplyLater: false,
      model: { modelId: "m", tier: "strong", feature: "creation" },
    };
    const decision = evaluateDeterministicCompletion(plan, [bareAnswer("What should it say?", "Hey")], "");
    expect(decision).toEqual({ mode: "model_replan", reason: "no_target_node" });
  });

  it("mixes a targeted answer and a bare answer (both forwarded; server resolves the bare one)", () => {
    const plan = planWith([
      { label: "Channel", kind: "config_value", nodeId: "n1", field: "channel", optionsSource: "slack:channels" },
      { label: "What should the message say?", kind: "config_value" }, // bare
    ]);
    const decision = evaluateDeterministicCompletion(
      plan,
      [
        // channel is a picker → must carry the selected option value (id).
        { key: "n1::channel", display: "#general", value: "C123", descriptor: { label: "Channel", kind: "config_value", nodeId: "n1", field: "channel", optionsSource: "slack:channels" } },
        bareAnswer("What should the message say?", "Hey"),
      ],
      "",
    );
    expect(decision.mode).toBe("deterministic");
    if (decision.mode !== "deterministic") return;
    expect(decision.answers).toEqual([
      { nodeId: "n1", field: "channel", value: "C123" },
      { value: "Hey" },
    ]);
  });

  // ─── Slice 4.AI-35G — picker-backed fields require the selected option id ───
  it("deterministic for an optionsSource field when the answer carries the selected option value (id)", () => {
    const plan = planWith([
      { label: "Channel", kind: "config_value", nodeId: "n1", field: "channel", fieldType: "combobox", optionsSource: "slack:channels" },
    ]);
    const pickedAnswer: RequiredInputAnswer = {
      key: "n1::channel",
      display: "#general",
      value: "C123", // the selected channel id
      descriptor: { label: "Channel", kind: "config_value", nodeId: "n1", field: "channel", fieldType: "combobox", optionsSource: "slack:channels" },
    };
    const decision = evaluateDeterministicCompletion(plan, [pickedAnswer], "");
    expect(decision.mode).toBe("deterministic");
    if (decision.mode !== "deterministic") return;
    // The ID is written, NOT the "#general" display label.
    expect(decision.answers).toEqual([{ nodeId: "n1", field: "channel", value: "C123" }]);
  });

  // ─── Slice 4.AI-35K — picker fields accept a manually-typed fallback ───
  it("deterministic with the typed display value when an optionsSource answer is free-text only (AI-35K)", () => {
    const plan = planWith([
      { label: "Channel", kind: "config_value", nodeId: "n1", field: "channel", fieldType: "combobox", optionsSource: "slack:channels" },
    ]);
    const freeTextOnly: RequiredInputAnswer = {
      key: "n1::channel",
      display: "#general", // typed a value, never picked an option (e.g. Slack disconnected)
      descriptor: { label: "Channel", kind: "config_value", nodeId: "n1", field: "channel", fieldType: "combobox", optionsSource: "slack:channels" },
    };
    const decision = evaluateDeterministicCompletion(plan, [freeTextOnly], "");
    // AI-35K: a failed/unselected picker no longer bounces to the model — the
    // typed value completes the field; the preview/activation validates it later.
    expect(decision.mode).toBe("deterministic");
    if (decision.mode !== "deterministic") return;
    expect(decision.answers).toEqual([{ nodeId: "n1", field: "channel", value: "#general" }]);
  });

  it("a selected option value/id still wins over the typed display text (AI-35K)", () => {
    const plan = planWith([
      { label: "Widget", kind: "config_value", nodeId: "n1", field: "widgetId", fieldType: "combobox", optionsSource: "acme:widgets" },
    ]);
    const picked: RequiredInputAnswer = {
      key: "n1::widgetId",
      display: "Friendly Widget Name", // display label
      value: "W-001", // selected option id — must win
      descriptor: { label: "Widget", kind: "config_value", nodeId: "n1", field: "widgetId", fieldType: "combobox", optionsSource: "acme:widgets" },
    };
    const decision = evaluateDeterministicCompletion(plan, [picked], "");
    expect(decision.mode).toBe("deterministic");
    if (decision.mode !== "deterministic") return;
    expect(decision.answers).toEqual([{ nodeId: "n1", field: "widgetId", value: "W-001" }]);
  });

  it("empty typed value for an optionsSource field is still missing (re-plan)", () => {
    const plan = planWith([
      { label: "Channel", kind: "config_value", nodeId: "n1", field: "channel", fieldType: "combobox", optionsSource: "slack:channels" },
    ]);
    // No staged answer at all → still missing.
    const decision = evaluateDeterministicCompletion(plan, [], "");
    expect(decision).toEqual({ mode: "model_replan", reason: "missing_answer" });
  });

  it("deterministic for a static-options field when the selected option value is present", () => {
    const plan = planWith([
      { label: "Event", kind: "config_value", nodeId: "n1", field: "eventType", fieldType: "select", options: [{ label: "Succeeded", value: "ok" }] },
    ]);
    const picked: RequiredInputAnswer = {
      key: "n1::eventType",
      display: "Succeeded",
      value: "ok",
      descriptor: { label: "Event", kind: "config_value", nodeId: "n1", field: "eventType", fieldType: "select", options: [{ label: "Succeeded", value: "ok" }] },
    };
    const decision = evaluateDeterministicCompletion(plan, [picked], "");
    expect(decision.mode).toBe("deterministic");
    if (decision.mode !== "deterministic") return;
    expect(decision.answers).toEqual([{ nodeId: "n1", field: "eventType", value: "ok" }]);
  });
});
