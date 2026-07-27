/**
 * Versioned AI credit policy (Slice 4.AI-CREDITS-2 — recording-only).
 *
 * Pure + dependency-free. Maps an AI feature + model tier to the number of AI
 * CREDITS a single LLM call costs. Credits are a PRODUCT unit, deliberately
 * decoupled from raw provider USD cost — `ai_cost_events.estimated_cost_micros`
 * is the internal economic truth; credits are what a plan meters. See
 * docs/slices/phase-4/ai-credits-and-agent-runtime-plan.md §3.
 *
 * RECORDING ONLY: this computes the value written to
 * `ai_cost_events.ai_credits_charged`. It does NOT deduct, reserve, gate, or
 * enforce — limits / RPC / gating are AI-CREDITS-3. No account-billing schema is
 * touched.
 *
 * Fail-closed for paid calls: an LLM call for an UNMAPPED feature is NEVER
 * silently 0 — it charges a conservative fallback and is flagged `mapped:false`
 * so it is queryable and never silently free. Only DETERMINISTIC (non-LLM) work
 * is free.
 *
 * Purity: no imports, no I/O, no env reads — mirrors `core/billing/planPolicy.ts`.
 */

/** Bump when any credit number/multiplier/mapping below changes (traceable in the ledger). */
export const AI_CREDIT_POLICY_VERSION = "ai-credits-v2";

/** Local tier type — kept dependency-free; the caller maps `core/ai` ModelTier into this. */
export type CreditModelTier = "fast" | "strong";

/** A stronger model costs proportionally more credits. */
export const TIER_CREDIT_MULTIPLIER: Readonly<Record<CreditModelTier, number>> = {
  fast: 1,
  strong: 2,
};

/**
 * Extra multiplier when a call is a model ESCALATION/fallback (a cheaper attempt
 * failed and we retried on a premium model) — the wasted first attempt makes it
 * cost more than a direct premium call. No current path escalates; the input is
 * wired so AI-CREDITS-3 routing can set it.
 */
export const ESCALATION_CREDIT_MULTIPLIER = 1.5;

/**
 * Conservative credit charge for an LLM call whose feature is not in the map.
 * Fail-closed: an unmapped PAID call is over-, never under-counted, and is
 * flagged `mapped:false`. Kept STRICTLY ABOVE the highest mapped base
 * (document_analysis = 10) so an unmapped call always costs more than any
 * priced one — and never collides with a mapped amount (the lockstep test
 * asserts provenance via inequality). Raised 5 → 15 in ai-credits-v2 alongside
 * the ~5× tier-allocation increase (AI-CREDITS-REPRICE-1).
 */
export const UNMAPPED_LLM_FALLBACK_CREDITS = 15;

/**
 * Base credits per LLM call, keyed by the `ai_cost_events.feature` value. A
 * feature ABSENT here is treated as unmapped (fail-closed). Owner direction:
 * explanation small, repair more, deep loops premium (loops are AI-CREDITS-3).
 * `cost_preview` is a deterministic preview (0).
 */
const FEATURE_BASE_CREDITS: Readonly<Record<string, number>> = {
  workflow_creation: 2,
  workflow_editing: 2,
  workflow_repair: 4,
  workflow_explanation: 1,
  // AI-DIAG-QA-2 — workflow diagnosis Q&A: one cheap (fast-tier) LLM call per
  // submitted question, same cost class as explanation. First-class for BOTH the credit
  // charge (here) and the `ai_cost_events.feature` telemetry row (migration
  // 20260703000000 widened the feature CHECK to allow `workflow_qa`).
  workflow_qa: 1,
  // HERMES-AGENT-CAPABILITY-ROUTE — advisory Hermes Agent workflow guidance: one cheap
  // (fast-tier) round-trip per request, same cost class as explanation / Q&A. Used by the
  // route's `aiCreditGate` AND the `workflow_guidance_intake` capability's registry
  // `creditFeature` (kept in lockstep by test). The gate path needs no DB CHECK widening;
  // this route does NOT write an `ai_cost_events` row (ChainReact makes no direct model
  // call — the Hermes Agent does), so no migration is required.
  workflow_guidance: 1,
  failed_run_analysis: 1,
  provider_discovery: 1,
  template_recommendation: 1,
  template_customization: 2,
  cost_preview: 0,
  // AI-PROVIDER-3 (CS-3) — the ChainReact AI provider's runtime capabilities.
  // Owner-approved base prices; the `strong` tier ("advanced" quality) doubles
  // them via TIER_CREDIT_MULTIPLIER. Registering them here is what makes
  // UNMAPPED_LLM_FALLBACK_CREDITS structurally unreachable for every registered
  // `ai:*` capability (lockstep-tested).
  //
  // ai-credits-v2 (AI-CREDITS-REPRICE-1, 2026-07-27): tier allocations grew ~5×
  // (Free 100 / Pro 2,000 / Team 10,000 / Business 50,000) to make everyday
  // interactive AI generous — guidance/explanation/Q&A stay at 1 credit and
  // interactive creation/editing/repair keep their v1 bases, so they became
  // ~4–5× cheaper in real terms. Analyze Document (3 → 10) and Transform Data
  // (2 → 5) are the UNATTENDED runtime actions: they run inside scheduled /
  // automated workflows on the largest inputs (parsed documents; upstream data),
  // so their prices scale with the allocation to protect margin on repeated
  // automated processing. Suggest Fields stays 1 (one small builder-time sample,
  // interactive, fast-only). Bases are model-economics estimates pending
  // calibration against prod `ai_cost_events` (estimated_cost_micros per call) —
  // see docs/billing/pricing-and-tiers.md for the calibration query + rule.
  document_analysis: 10,
  data_transform: 5,
  schema_suggestion: 1,
};

/**
 * Read-only view of the priced-feature map. Exported so lockstep tests can
 * assert registry ↔ policy coverage against the REAL map instead of
 * duplicating expected numbers.
 */
export function getFeatureBaseCredits(feature: string): number | undefined {
  return FEATURE_BASE_CREDITS[feature];
}

/** Whether a feature has an explicit price (i.e. never hits the fallback). */
export function isFeaturePriced(feature: string): boolean {
  return FEATURE_BASE_CREDITS[feature] !== undefined;
}

export interface AiCreditChargeInput {
  /** The `ai_cost_events.feature` value. */
  readonly feature: string;
  /**
   * False for DETERMINISTIC work (no LLM call) — e.g. `services/diagnostics/*`.
   * Deterministic work is always 0 credits. True for any real model call.
   */
  readonly isLlmCall: boolean;
  /** Tier of the model actually used. Defaults to `fast` when absent/unknown. */
  readonly modelTier?: CreditModelTier | null;
  /** True when this call was a model escalation/fallback. */
  readonly escalated?: boolean;
}

export interface AiCreditCharge {
  readonly credits: number;
  readonly policyVersion: string;
  /** False → the feature was not in the policy map (an unmapped paid LLM call). */
  readonly mapped: boolean;
  readonly escalated: boolean;
}

/**
 * Compute the AI credit charge for one unit of AI work. Pure + deterministic.
 *
 *   - deterministic (no LLM) → 0, always.
 *   - mapped LLM feature      → base × tierMultiplier × (escalated ? ESCALATION : 1).
 *   - unmapped LLM feature    → conservative fallback × multiplier, `mapped:false`.
 *
 * `Math.ceil` keeps credits whole and never rounds a paid call down to 0.
 */
export function computeAiCreditCharge(input: AiCreditChargeInput): AiCreditCharge {
  const escalated = input.escalated === true;

  // Deterministic work (no LLM) is always free — short-circuit before the map.
  if (!input.isLlmCall) {
    return { credits: 0, policyVersion: AI_CREDIT_POLICY_VERSION, mapped: true, escalated };
  }

  const tier: CreditModelTier = input.modelTier === "strong" ? "strong" : "fast";
  const multiplier =
    TIER_CREDIT_MULTIPLIER[tier] * (escalated ? ESCALATION_CREDIT_MULTIPLIER : 1);

  const base = FEATURE_BASE_CREDITS[input.feature];
  if (base === undefined) {
    // Fail-closed: never silently 0 for an unmapped PAID call.
    return {
      credits: Math.ceil(UNMAPPED_LLM_FALLBACK_CREDITS * multiplier),
      policyVersion: AI_CREDIT_POLICY_VERSION,
      mapped: false,
      escalated,
    };
  }
  return {
    credits: Math.ceil(base * multiplier),
    policyVersion: AI_CREDIT_POLICY_VERSION,
    mapped: true,
    escalated,
  };
}
