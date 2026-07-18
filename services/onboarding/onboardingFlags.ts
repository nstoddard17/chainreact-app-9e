/**
 * Onboarding feature flags (5.ONBOARD-1).
 *
 * DEFAULT OFF — while off, the checklist routes are inert (GET returns
 * `{enabled:false}`, mutations 404), the dashboard renders nothing, and the
 * activation-time completion latch is a no-op. Read at call time (not module
 * load) so tests + rollout can toggle without re-importing — the established
 * V2 flag pattern (services/billing/billingFeatureFlags.ts).
 */

/** Env var name for the first-workflow onboarding checklist rollout flag. */
export const ONBOARDING_CHECKLIST_FLAG = "ENABLE_ONBOARDING_CHECKLIST";

/** True only when ENABLE_ONBOARDING_CHECKLIST === "true". Default false. */
export function isOnboardingChecklistEnabled(): boolean {
  return process.env[ONBOARDING_CHECKLIST_FLAG] === "true";
}
