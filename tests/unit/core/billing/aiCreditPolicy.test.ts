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
