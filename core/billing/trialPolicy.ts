import type { PlanTier } from "@/core/billing/planPolicy";

/**
 * Free-trial ELIGIBILITY policy (Slice PRO-TEAM-TRIAL-ENFORCEMENT-1).
 *
 * Pure data + helpers — no DB, no env, no I/O (core/ may import only contracts/ + sibling
 * core/). This is the SINGLE server-owned allowlist that answers "can this plan tier ever
 * carry a free trial". It layers on top of, and never replaces, the two other authorities:
 *   - the ACCOUNT's DB state (`account_billing.trial_consumed_at`) — did this account already
 *     use its one trial (authoritative, permanent);
 *   - the platform trial CONFIG (`services/billing/platformTrialPolicy.resolveTrialPeriodDays`)
 *     — is a trial length configured at all (dark-launch gate; 0 = no trials offered).
 *
 * The one rule (locked): ONLY Pro and Team are trial-eligible. Free, Business, Enterprise,
 * unknown/retired/malformed plan identifiers all default to NO trial. Eligibility is NEVER
 * inferred from plan ordering, "is it paid", pricing, or a client-supplied flag — it is this
 * explicit set and nothing else.
 *
 * The trial belongs to the canonical ChainReact `account_id`, not to a plan / price / product /
 * subscription / interval / user. This module only classifies the PLAN; the account-scoped
 * one-trial rule is enforced by the atomic DB claim (see repositories/accountBilling.claim…).
 */

/** The ONLY trial-eligible plan tiers. Server-owned; never client-supplied. */
export const TRIAL_ELIGIBLE_PLANS = ["pro", "team"] as const;
export type TrialEligiblePlan = (typeof TRIAL_ELIGIBLE_PLANS)[number];

/**
 * True ONLY for Pro and Team. Business, Enterprise, Free, and any unknown / retired /
 * malformed identifier (typed as `string` here so a forged value can't sneak through the
 * `PlanTier` type) fail closed to `false`. This is the allowlist the checkout claim path and
 * the UI eligibility both read — there is no other place that decides trial-eligibility.
 */
export function isTrialEligiblePlan(plan: PlanTier | string | null | undefined): plan is TrialEligiblePlan {
  return plan === "pro" || plan === "team";
}

/**
 * Recommended trial length, in days (owner-approved, 2026-07-15). This is the RECOMMENDED
 * value only — the EFFECTIVE trial length is resolved from config
 * (`resolveTrialPeriodDays`), which defaults to 0 (dark: no trial offered) until the owner
 * sets `PLATFORM_TRIAL_PERIOD_DAYS`. Shipping dark mirrors how the rest of platform billing
 * dark-launched. Set the env to this number to go live.
 */
export const RECOMMENDED_TRIAL_PERIOD_DAYS = 14;

/** Hard upper bound on any configured trial length (defensive clamp; ~1 year). */
export const MAX_TRIAL_PERIOD_DAYS = 365;
