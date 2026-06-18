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
export const AI_CREDIT_POLICY_VERSION = "ai-credits-v1";

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
 * flagged `mapped:false`.
 */
export const UNMAPPED_LLM_FALLBACK_CREDITS = 5;

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
  failed_run_analysis: 1,
  provider_discovery: 1,
  template_recommendation: 1,
  template_customization: 2,
  cost_preview: 0,
};

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
