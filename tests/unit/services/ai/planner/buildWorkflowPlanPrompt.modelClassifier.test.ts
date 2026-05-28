/**
 * @jest-environment node
 *
 * Slice 4.AI-34C — tier-routing attribution when the OpenAI model classifier
 * is threaded into the (pure) prompt builder via `WorkflowPlanPromptInput`.
 *
 * Pins: model_succeeded unions candidates into the catalog + reports
 * `classifier_model_succeeded` / `classifierModelTier:"fast"` /
 * `finalProviderCount > deterministicProviderCount`; model_failed +
 * openai_not_configured fall back to deterministic with the right reason +
 * `fallbackToDeterministic`; the PLANNER tier stays `strong` (Anthropic) in
 * every case; no-leak holds.
 */
import {
  buildWorkflowPlanPromptV1WithAttribution,
  buildWorkflowPlanPromptV2WithAttribution,
} from "@/services/ai/planner";
import type { NarrowingClassifierResult } from "@/services/ai/planner/narrowingClassifier";
import type { WorkflowPlanPromptInput } from "@/services/ai/planner/types";
import type {
  ProviderCatalogEntry,
  ProviderCatalogView,
} from "@/services/ai/tools/providerCatalog";

function actionEntry(key: string) {
  return {
    key,
    displayName: key,
    category: "messaging" as const,
    riskLevel: "low" as const,
    isDestructive: false,
    requiresConfirmation: false,
    requiresIntegration: true,
    configFields: [{ name: "text", type: "textarea" as const, required: true }],
    outputs: [{ name: "ok", type: "boolean" }],
  };
}
function triggerEntry(key: string) {
  return {
    key,
    displayName: key,
    category: "messaging" as const,
    activation: "webhook" as const,
    requiresIntegration: true,
    configFields: [{ name: "channel", type: "combobox" as const, required: true }],
    outputs: [{ name: "text", type: "string" }],
  };
}
function provider(id: string): ProviderCatalogEntry {
  return {
    id,
    displayName: id,
    capabilities: { oauth: true, webhookTrigger: true, pollingTrigger: false, actions: true },
    isEnabled: true,
    isExperimental: false,
    hasMetadata: true,
    actions: [actionEntry(`${id}:send`)],
    triggers: [triggerEntry(`${id}:event`)],
  };
}
function catalog(): ProviderCatalogView {
  return { providers: [provider("slack"), provider("gmail"), provider("stripe"), provider("notion"), provider("native")] };
}
function modelClassifier(candidateProviders: string[], confidence: "high" | "medium" | "low" = "medium"): NarrowingClassifierResult {
  return {
    intentType: "create",
    confidence,
    candidateProviders,
    triggerHints: [],
    actionHints: [],
    broadOrAmbiguous: false,
    source: "model",
    modelTier: "fast",
  };
}
function makeInput(overrides: Partial<WorkflowPlanPromptInput> = {}): WorkflowPlanPromptInput {
  return { userRequest: "Send a Slack DM", catalog: catalog(), connectedIntegrations: [], ...overrides };
}

describe("AI-34C — model_succeeded unions candidates + records fast-tier classifier", () => {
  it("V2: adds the model's candidate provider to the catalog + attribution", () => {
    const { attribution, messages } = buildWorkflowPlanPromptV2WithAttribution(
      makeInput({ modelClassifier: modelClassifier(["gmail"]), modelClassifierOutcome: "model_succeeded" }),
    );
    expect(attribution.deterministicProviderCount).toBe(2); // slack + native
    expect(attribution.finalProviderCount).toBe(3); // + gmail (unioned)
    expect(attribution.classifierModelTier).toBe("fast");
    expect(attribution.classifierConfidence).toBe("medium");
    expect(attribution.classifierProviderCount).toBe(1);
    expect(attribution.classifierUsed).toBe(true);
    expect(attribution.fallbackToDeterministic).toBe(false);
    expect(attribution.tierRoutingReason).toBe("classifier_model_succeeded");
    // The PLANNER stays on strong (Anthropic) — only the catalog grew.
    expect(attribution.plannerModelTier).toBe("strong");
    expect(messages[0]!.content).toContain("- slack");
    expect(messages[0]!.content).toContain("- gmail");
  });

  it("unknown model candidate ids never enter the catalog", () => {
    const { attribution, messages } = buildWorkflowPlanPromptV2WithAttribution(
      makeInput({ modelClassifier: modelClassifier(["made-up"]), modelClassifierOutcome: "model_succeeded" }),
    );
    expect(attribution.finalProviderCount).toBe(2); // nothing valid added
    expect(messages[0]!.content).not.toContain("made-up");
  });

  it("V1 builder applies the same union + attribution", () => {
    const { attribution } = buildWorkflowPlanPromptV1WithAttribution(
      makeInput({ modelClassifier: modelClassifier(["stripe"]), modelClassifierOutcome: "model_succeeded" }),
    );
    expect(attribution.finalProviderCount).toBe(3);
    expect(attribution.tierRoutingReason).toBe("classifier_model_succeeded");
    expect(attribution.plannerModelTier).toBe("strong");
  });
});

describe("AI-34C — fallback outcomes use deterministic narrowing", () => {
  it("model_failed → deterministic classifier, fallbackToDeterministic true, reason classifier_model_failed", () => {
    const { attribution } = buildWorkflowPlanPromptV2WithAttribution(
      makeInput({ modelClassifierOutcome: "model_failed" }),
    );
    expect(attribution.classifierModelTier).toBeNull(); // deterministic ran
    expect(attribution.classifierUsed).toBe(true);
    expect(attribution.fallbackToDeterministic).toBe(true);
    expect(attribution.tierRoutingReason).toBe("classifier_model_failed");
    expect(attribution.finalProviderCount).toBe(attribution.deterministicProviderCount);
    expect(attribution.plannerModelTier).toBe("strong");
  });

  it("openai_not_configured → deterministic, fallbackToDeterministic true, reason openai_not_configured", () => {
    const { attribution } = buildWorkflowPlanPromptV2WithAttribution(
      makeInput({ modelClassifierOutcome: "openai_not_configured" }),
    );
    expect(attribution.fallbackToDeterministic).toBe(true);
    expect(attribution.tierRoutingReason).toBe("openai_not_configured");
    expect(attribution.classifierModelTier).toBeNull();
  });

  it("model_disabled → identical to AI-31 (no fallback flag, feature_default_strong)", () => {
    const { attribution } = buildWorkflowPlanPromptV2WithAttribution(
      makeInput({ modelClassifierOutcome: "model_disabled" }),
    );
    expect(attribution.fallbackToDeterministic).toBe(false);
    expect(attribution.tierRoutingReason).toBe("feature_default_strong");
    expect(attribution.classifierModelTier).toBeNull();
  });
});

describe("AI-34C — no-leak in model-classifier attribution", () => {
  it("does not echo the raw user request and emits no arrays", () => {
    const { attribution } = buildWorkflowPlanPromptV2WithAttribution(
      makeInput({
        userRequest: "SECRET-34C-PHRASE send a Slack DM",
        modelClassifier: modelClassifier(["gmail"]),
        modelClassifierOutcome: "model_succeeded",
      }),
    );
    for (const value of Object.values(attribution)) {
      expect(Array.isArray(value)).toBe(false);
      if (typeof value === "string") expect(value).not.toContain("SECRET-34C-PHRASE");
    }
  });
});
