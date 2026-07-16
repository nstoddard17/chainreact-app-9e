import type { PlanTier } from "@/core/billing/planPolicy";
import { MAX_TRIAL_PERIOD_DAYS, isTrialEligiblePlan } from "@/core/billing/trialPolicy";

/**
 * PLATFORM trial CONFIG (PRO-TEAM-TRIAL-ENFORCEMENT-1) — the env-reading, DB-free half of trial
 * policy. Deliberately imports NO repository / server client, so it is safe to use from public
 * surfaces (the marketing pricing page) and from checkout without pulling in Stripe/DB deps.
 * The account-scoped OFFER (which must read the DB's consumed marker) lives in the sibling
 * `platformTrialPolicy`.
 *
 * DARK BY DEFAULT: `resolveTrialPeriodDays()` returns 0 unless `PLATFORM_TRIAL_PERIOD_DAYS` is set
 * to a positive integer. 0 = no trial offered/claimed anywhere (the whole system is inert). Setting
 * the var to the owner-approved length (14) is the single go-live switch — real billing config
 * (a trial needs a length), NOT a temporary feature flag. Lazy env read (call time, not module
 * load) so a build with the var blank still passes CI.
 */

/** Env var carrying the effective trial length in days. Unset/blank/≤0 → no trial (dark). */
export const PLATFORM_TRIAL_PERIOD_DAYS_ENV = "PLATFORM_TRIAL_PERIOD_DAYS";

/**
 * Effective trial length in days from config, or 0 when trials are off (dark). Parses
 * `PLATFORM_TRIAL_PERIOD_DAYS` as a non-negative integer and clamps to
 * `[0, MAX_TRIAL_PERIOD_DAYS]`. Any malformed / negative / non-integer value fails closed to 0 so a
 * misconfig never grants an unbounded or accidental trial.
 */
export function resolveTrialPeriodDays(): number {
  const raw = process.env[PLATFORM_TRIAL_PERIOD_DAYS_ENV]?.trim();
  // Require a plain non-negative integer string — a strict form so "14.5", "1e2", "-5",
  // "Infinity", "NaN", and any garbage all fail closed to 0 rather than coercing to a number.
  if (!raw || !/^\d+$/.test(raw)) return 0;
  const n = Number(raw);
  if (n <= 0) return 0;
  return Math.min(n, MAX_TRIAL_PERIOD_DAYS);
}

/** Whether the platform is currently offering trials at all (config gate only). */
export function areTrialsEnabled(): boolean {
  return resolveTrialPeriodDays() > 0;
}

/**
 * The trial the SERVER would grant for a (plan) selection based on the plan allowlist + config
 * ONLY — it does NOT consult the account's consumed-trial state. `trialPeriodDays` is 0 whenever the
 * plan is not trial-eligible or trials are off, so an ineligible/Business/Enterprise selection can
 * never carry a trial length.
 */
export function planTrialConfig(plan: PlanTier): {
  eligiblePlan: boolean;
  trialPeriodDays: number;
} {
  const eligiblePlan = isTrialEligiblePlan(plan);
  return {
    eligiblePlan,
    trialPeriodDays: eligiblePlan ? resolveTrialPeriodDays() : 0,
  };
}
