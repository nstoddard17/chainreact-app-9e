/**
 * @jest-environment node
 *
 * Slice 4.AI-34C — additive-safety tests for the classifier/narrowing resolver.
 *
 * The model classifier is ADVISORY: its valid candidates are UNIONED into the
 * deterministic narrowed set. These tests pin the hard invariants:
 *   - union only ADDS valid catalog ids,
 *   - deterministic / explicit / connected / canvas providers are NEVER dropped,
 *   - unknown ids are ignored,
 *   - a full-catalog fallback is never shrunk,
 *   - with no model result, the resolver reproduces the AI-31 deterministic path.
 */
import {
  augmentNarrowingWithModelCandidates,
  resolvePromptClassifier,
} from "@/services/ai/planner/resolvePromptClassifier";
import type { NarrowingClassifierResult } from "@/services/ai/planner/narrowingClassifier";
import type {
  NarrowProvidersInput,
  NarrowProvidersResult,
} from "@/services/ai/planner/narrowProvidersForPlan";
import type { WorkflowPlanPromptInput } from "@/services/ai/planner/types";
import type {
  ProviderCatalogEntry,
  ProviderCatalogView,
} from "@/services/ai/tools/providerCatalog";

function prov(id: string): ProviderCatalogEntry {
  return {
    id,
    displayName: id,
    capabilities: { oauth: true, webhookTrigger: true, pollingTrigger: false, actions: true },
    isEnabled: true,
    isExperimental: false,
    hasMetadata: true,
    actions: [],
    triggers: [],
  };
}

const CATALOG_IDS = ["slack", "gmail", "microsoft-outlook", "stripe", "native"];
const catalog: ProviderCatalogView = { providers: CATALOG_IDS.map(prov) };
const catalogIdSet = new Set(CATALOG_IDS);

/** A deterministic narrowed result: explicit slack + native (3 omitted). */
function narrowed(): NarrowProvidersResult {
  return {
    mode: "narrowed",
    providerIds: new Set(["slack", "native"]),
    explicitlyMentionedProviderIds: ["slack"],
    aliasMatchedProviderIds: [],
    ambiguousInclusions: [],
    connectedProviderIds: [],
    canvasProviderIds: [],
    nativeIncluded: true,
    fallbackReason: null,
    omittedProviderCount: 3,
  };
}

function fullCatalog(): NarrowProvidersResult {
  return {
    mode: "full-catalog",
    providerIds: new Set(CATALOG_IDS),
    explicitlyMentionedProviderIds: [],
    aliasMatchedProviderIds: [],
    ambiguousInclusions: [],
    connectedProviderIds: [],
    canvasProviderIds: [],
    nativeIncluded: true,
    fallbackReason: "ambiguous_broad_request",
    omittedProviderCount: 0,
  };
}

function modelResult(candidateProviders: string[]): NarrowingClassifierResult {
  return {
    intentType: "create",
    confidence: "high",
    candidateProviders,
    triggerHints: [],
    actionHints: [],
    broadOrAmbiguous: false,
    source: "model",
    modelTier: "fast",
  };
}

function promptInput(modelClassifier?: NarrowingClassifierResult | null): WorkflowPlanPromptInput {
  return {
    userRequest: "Send a Slack message when I get a Gmail email",
    catalog,
    connectedIntegrations: [],
    ...(modelClassifier !== undefined ? { modelClassifier } : {}),
    ...(modelClassifier ? { modelClassifierOutcome: "model_succeeded" as const } : {}),
  };
}

function narrowingInput(): NarrowProvidersInput {
  return { userRequest: "Send a Slack message when I get a Gmail email", catalog, connectedIntegrations: [] };
}

describe("augmentNarrowingWithModelCandidates", () => {
  it("adds valid candidate ids and drops unknown ones", () => {
    const out = augmentNarrowingWithModelCandidates(narrowed(), ["gmail", "totally-not-real"], catalogIdSet);
    expect([...out.providerIds].sort()).toEqual(["gmail", "native", "slack"]);
    expect(out.omittedProviderCount).toBe(2); // 3 - 1 added
    expect(out.mode).toBe("narrowed");
  });

  it("never DROPS a deterministic provider even if the candidate list omits it", () => {
    const out = augmentNarrowingWithModelCandidates(narrowed(), ["stripe"], catalogIdSet);
    expect(out.providerIds.has("slack")).toBe(true); // explicit/deterministic preserved
    expect(out.providerIds.has("native")).toBe(true);
    expect(out.providerIds.has("stripe")).toBe(true); // added
  });

  it("is a no-op for a full-catalog fallback (can never shrink it)", () => {
    const full = fullCatalog();
    const out = augmentNarrowingWithModelCandidates(full, ["slack"], catalogIdSet);
    expect(out).toBe(full); // same reference — unchanged
  });

  it("adding a candidate already present does not change omitted count", () => {
    const out = augmentNarrowingWithModelCandidates(narrowed(), ["slack"], catalogIdSet);
    expect(out.omittedProviderCount).toBe(3);
    expect([...out.providerIds].sort()).toEqual(["native", "slack"]);
  });
});

describe("resolvePromptClassifier — model classifier succeeded", () => {
  it("unions valid candidates; final > deterministic; outcome model_succeeded", () => {
    const resolved = resolvePromptClassifier(
      promptInput(modelResult(["gmail"])),
      narrowingInput(),
      narrowed(),
    );
    expect(resolved.classifier?.source).toBe("model");
    expect(resolved.deterministicProviderCount).toBe(2);
    expect(resolved.finalProviderCount).toBe(3); // slack, native + gmail
    expect(resolved.effectiveNarrowing.providerIds.has("gmail")).toBe(true);
    expect(resolved.effectiveNarrowing.providerIds.has("slack")).toBe(true);
    expect(resolved.modelClassifierOutcome).toBe("model_succeeded");
  });

  it("unknown candidate ids from the model are ignored (no catalog pollution)", () => {
    const resolved = resolvePromptClassifier(
      promptInput(modelResult(["made-up-provider", "another-fake"])),
      narrowingInput(),
      narrowed(),
    );
    expect(resolved.finalProviderCount).toBe(2); // nothing valid added
    expect([...resolved.effectiveNarrowing.providerIds].sort()).toEqual(["native", "slack"]);
  });

  it("low-confidence model result still only ADDS (never narrows dangerously)", () => {
    const lowConf = { ...modelResult(["stripe"]), confidence: "low" as const };
    const resolved = resolvePromptClassifier(promptInput(lowConf), narrowingInput(), narrowed());
    // slack/native preserved; stripe added; never smaller than deterministic.
    expect(resolved.finalProviderCount).toBeGreaterThanOrEqual(resolved.deterministicProviderCount);
    expect(resolved.effectiveNarrowing.providerIds.has("slack")).toBe(true);
  });
});

describe("resolvePromptClassifier — no model classifier (AI-31 deterministic path)", () => {
  it("runs the deterministic classifier and leaves narrowing unchanged", () => {
    const det = narrowed();
    const resolved = resolvePromptClassifier(promptInput(), narrowingInput(), det);
    expect(resolved.classifier?.source).toBe("deterministic");
    expect(resolved.effectiveNarrowing).toBe(det); // unchanged reference
    expect(resolved.finalProviderCount).toBe(resolved.deterministicProviderCount);
    expect(resolved.modelClassifierOutcome).toBeUndefined();
  });

  it("passes through a model_failed outcome onto the deterministic path", () => {
    const det = narrowed();
    const input: WorkflowPlanPromptInput = {
      ...promptInput(),
      modelClassifierOutcome: "model_failed",
    };
    const resolved = resolvePromptClassifier(input, narrowingInput(), det);
    expect(resolved.classifier?.source).toBe("deterministic");
    expect(resolved.effectiveNarrowing).toBe(det);
    expect(resolved.modelClassifierOutcome).toBe("model_failed");
  });
});
