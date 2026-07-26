import type { PlanTier } from "@/core/billing/planPolicy";
import type { TrialEligiblePlan } from "@/core/billing/trialPolicy";
import { planTrialConfig } from "@/core/billing/platformTrialConfig";
import { getTrialStateServiceRole } from "@/repositories/accountBilling";

/**
 * PLATFORM per-account trial OFFER resolution (PRO-TEAM-TRIAL-ENFORCEMENT-1).
 *
 * The DB-backed half of trial policy: it combines the config/allowlist decision
 * (`platformTrialConfig`) with the account's AUTHORITATIVE consumed marker. This module imports a
 * repository, so it is server-only — public surfaces (pricing page) must use `platformTrialConfig`
 * instead. Config symbols are re-exported here for convenience so server callers/tests have one
 * import site.
 *
 * The trial OFFER for an account is the AND of three independent authorities, each of which can
 * veto:
 *   1. server-owned plan allowlist  — Pro/Team only (`platformTrialConfig`);
 *   2. platform config              — `resolveTrialPeriodDays() > 0` (dark gate);
 *   3. the account's own DB state    — `trial_consumed_at IS NULL` (the permanent one-trial marker).
 *
 * This resolves only what the SERVER should OFFER (advisory, for CTA copy). The checkout path
 * re-decides and ATOMICALLY claims — this is never the authority for granting a trial.
 */

export {
  PLATFORM_TRIAL_PERIOD_DAYS_ENV,
  resolveTrialPeriodDays,
  areTrialsEnabled,
  planTrialConfig,
} from "@/core/billing/platformTrialConfig";

/** A sanitized, client-safe view of whether an account may start a trial on `plan`. */
export interface TrialOffer {
  /** True only when the plan is Pro/Team, trials are configured on, AND the account has not
   *  already consumed its one trial. This is the boolean the UI uses to choose CTA copy. */
  eligible: boolean;
  /** Offered trial length in days when `eligible`, else 0. Never reveals a length for an
   *  ineligible plan or an already-consumed account. */
  trialPeriodDays: number;
}

/**
 * Resolve the account-scoped trial offer for a plan selection: the AND of the plan allowlist, the
 * config gate, and the account's authoritative `trial_consumed_at IS NULL`. Service-role read of
 * the trial state (the raw timestamp never leaves this function — only the derived booleans do).
 * Fails closed to `{ eligible: false, trialPeriodDays: 0 }` on any doubt (ineligible plan, trials
 * off, already consumed). Used to render honest CTAs; the checkout path still re-decides and
 * atomically claims server-side (this is advisory, never authoritative).
 */
export async function resolveTrialOffer(
  accountId: string,
  plan: PlanTier,
): Promise<TrialOffer> {
  const { eligiblePlan, trialPeriodDays } = planTrialConfig(plan);
  if (!eligiblePlan || trialPeriodDays <= 0) {
    return { eligible: false, trialPeriodDays: 0 };
  }
  const state = await getTrialStateServiceRole(accountId);
  const alreadyConsumed = state?.consumedAt != null;
  return alreadyConsumed
    ? { eligible: false, trialPeriodDays: 0 }
    : { eligible: true, trialPeriodDays };
}

export type { TrialEligiblePlan };
