/**
 * @jest-environment node
 *
 * Tests for the versioned AI credit policy (Slice 4.AI-CREDITS-2, recording-only).
 * Pure function — no mocks. Pins: deterministic=0, explanation low, repair higher,
 * tier + escalation multipliers, and that an UNMAPPED paid feature never becomes
 * silently free.
 */
import {
  AI_CREDIT_POLICY_VERSION,
  ESCALATION_CREDIT_MULTIPLIER,
  TIER_CREDIT_MULTIPLIER,
  UNMAPPED_LLM_FALLBACK_CREDITS,
  computeAiCreditCharge,
  getFeatureBaseCredits,
  isFeaturePriced,
} from "@/core/billing/aiCreditPolicy";

describe("computeAiCreditCharge — deterministic work is free", () => {
  it("deterministic (no LLM) workflow diagnosis = 0 credits, mapped", () => {
    const c = computeAiCreditCharge({ feature: "other", isLlmCall: false });
    expect(c.credits).toBe(0);
    expect(c.mapped).toBe(true);
    expect(c.policyVersion).toBe(AI_CREDIT_POLICY_VERSION);
  });

  it("deterministic stays 0 even for a normally-paid feature", () => {
    expect(computeAiCreditCharge({ feature: "workflow_repair", isLlmCall: false }).credits).toBe(0);
  });
});

describe("computeAiCreditCharge — per-feature LLM bases", () => {
  it("explanation is low-credit (1 at fast tier)", () => {
    expect(
      computeAiCreditCharge({ feature: "workflow_explanation", isLlmCall: true, modelTier: "fast" })
        .credits,
    ).toBe(1);
  });

  it("repair planning costs more than explanation", () => {
    const repair = computeAiCreditCharge({
      feature: "workflow_repair",
      isLlmCall: true,
      modelTier: "fast",
    }).credits;
    const explanation = computeAiCreditCharge({
      feature: "workflow_explanation",
      isLlmCall: true,
      modelTier: "fast",
    }).credits;
    expect(repair).toBeGreaterThan(explanation);
    expect(repair).toBe(4);
  });

  it("provider_discovery classifier (fast) = 1", () => {
    expect(
      computeAiCreditCharge({ feature: "provider_discovery", isLlmCall: true, modelTier: "fast" })
        .credits,
    ).toBe(1);
  });
});

describe("computeAiCreditCharge — tier + escalation multipliers", () => {
  it("strong tier doubles the base (creation: 2 → 4)", () => {
    expect(
      computeAiCreditCharge({ feature: "workflow_creation", isLlmCall: true, modelTier: "strong" })
        .credits,
    ).toBe(2 * TIER_CREDIT_MULTIPLIER.strong);
  });

  it("escalation applies an additional multiplier (ceil)", () => {
    const base = computeAiCreditCharge({
      feature: "workflow_creation",
      isLlmCall: true,
      modelTier: "fast",
    });
    const escalated = computeAiCreditCharge({
      feature: "workflow_creation",
      isLlmCall: true,
      modelTier: "fast",
      escalated: true,
    });
    expect(escalated.escalated).toBe(true);
    expect(escalated.credits).toBe(Math.ceil(base.credits * ESCALATION_CREDIT_MULTIPLIER));
    expect(escalated.credits).toBeGreaterThan(base.credits);
  });

  it("missing tier defaults to fast", () => {
    const a = computeAiCreditCharge({ feature: "workflow_creation", isLlmCall: true });
    const b = computeAiCreditCharge({
      feature: "workflow_creation",
      isLlmCall: true,
      modelTier: "fast",
    });
    expect(a.credits).toBe(b.credits);
  });
});

describe("computeAiCreditCharge — unknown paid feature fails closed", () => {
  it("an unmapped PAID LLM feature is NEVER silently 0, and is flagged", () => {
    const c = computeAiCreditCharge({
      feature: "some_new_unmapped_feature",
      isLlmCall: true,
      modelTier: "fast",
    });
    expect(c.credits).toBe(UNMAPPED_LLM_FALLBACK_CREDITS);
    expect(c.credits).toBeGreaterThan(0);
    expect(c.mapped).toBe(false);
  });

  it("unmapped + strong tier scales the fallback (still > 0, flagged)", () => {
    const c = computeAiCreditCharge({
      feature: "unmapped_x",
      isLlmCall: true,
      modelTier: "strong",
    });
    expect(c.mapped).toBe(false);
    expect(c.credits).toBe(
      Math.ceil(UNMAPPED_LLM_FALLBACK_CREDITS * TIER_CREDIT_MULTIPLIER.strong),
    );
  });
});

// ─── AI-PROVIDER-3 (CS-3): ChainReact AI provider capability pricing ─────────

describe("computeAiCreditCharge — AI provider capabilities", () => {
  const price = (feature: string, modelTier: "fast" | "strong") =>
    computeAiCreditCharge({ feature, isLlmCall: true, modelTier }).credits;

  it("document_analysis: 10 credits standard/fast, 20 advanced/strong (ai-credits-v2)", () => {
    expect(price("document_analysis", "fast")).toBe(10);
    expect(price("document_analysis", "strong")).toBe(20);
  });

  it("data_transform: 5 credits standard/fast, 10 advanced/strong (ai-credits-v2)", () => {
    expect(price("data_transform", "fast")).toBe(5);
    expect(price("data_transform", "strong")).toBe(10);
  });

  it("schema_suggestion: 1 credit (fast — the only tier its registry allows)", () => {
    expect(price("schema_suggestion", "fast")).toBe(1);
  });

  it("all three are explicitly priced — never the unmapped fallback", () => {
    for (const feature of ["document_analysis", "data_transform", "schema_suggestion"]) {
      expect(isFeaturePriced(feature)).toBe(true);
      expect(getFeatureBaseCredits(feature)).toBeGreaterThan(0);
      const charge = computeAiCreditCharge({ feature, isLlmCall: true, modelTier: "fast" });
      expect(charge.mapped).toBe(true);
      expect(charge.credits).toBeLessThan(UNMAPPED_LLM_FALLBACK_CREDITS);
    }
  });

  it("the fallback stays STRICTLY above every mapped base (fail-closed ordering, v2)", () => {
    // An unmapped paid call must always over-count vs. any priced feature —
    // document_analysis (10) is the ceiling; the fallback (15) sits above it.
    expect(UNMAPPED_LLM_FALLBACK_CREDITS).toBe(15);
    expect(UNMAPPED_LLM_FALLBACK_CREDITS).toBeGreaterThan(
      getFeatureBaseCredits("document_analysis")!,
    );
  });

  it("lightweight interactive features stay 1 credit (generous everyday AI, v2)", () => {
    for (const feature of [
      "workflow_guidance",
      "workflow_explanation",
      "workflow_qa",
      "failed_run_analysis",
      "schema_suggestion",
    ]) {
      expect(getFeatureBaseCredits(feature)).toBe(1);
    }
  });

  it("unattended runtime actions cost more than any interactive builder feature (v2)", () => {
    // Margin protection lives on automated processing, not everyday building:
    // both runtime actions price above repair (4), the priciest interactive base.
    expect(getFeatureBaseCredits("document_analysis")!).toBeGreaterThan(4);
    expect(getFeatureBaseCredits("data_transform")!).toBeGreaterThan(4);
  });

  it("the strong-tier multiplier is unchanged at 2x for the new features", () => {
    expect(TIER_CREDIT_MULTIPLIER.strong).toBe(2);
    expect(price("document_analysis", "strong")).toBe(
      price("document_analysis", "fast") * TIER_CREDIT_MULTIPLIER.strong,
    );
  });

  it("deterministic (non-LLM) AI provider work stays free", () => {
    expect(
      computeAiCreditCharge({ feature: "document_analysis", isLlmCall: false }).credits,
    ).toBe(0);
  });

  it("isFeaturePriced reports false for a genuinely unknown feature", () => {
    expect(isFeaturePriced("image_understanding")).toBe(false);
    expect(getFeatureBaseCredits("image_understanding")).toBeUndefined();
  });
});
