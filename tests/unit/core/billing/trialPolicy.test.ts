/**
 * @jest-environment node
 *
 * PRO-TEAM-TRIAL-ENFORCEMENT-1 — server-owned trial-eligibility allowlist (pure).
 *
 * Proves the ONE rule: only Pro and Team are trial-eligible; Free, Business, Enterprise, and any
 * unknown / retired / malformed identifier fail closed to false. Eligibility is the explicit set,
 * never inferred from ordering / "is it paid" / pricing.
 */

import {
  TRIAL_ELIGIBLE_PLANS,
  isTrialEligiblePlan,
  RECOMMENDED_TRIAL_PERIOD_DAYS,
  MAX_TRIAL_PERIOD_DAYS,
} from "@/core/billing/trialPolicy";

describe("trialPolicy — eligibility allowlist", () => {
  it("the allowlist is exactly Pro and Team", () => {
    expect([...TRIAL_ELIGIBLE_PLANS].sort()).toEqual(["pro", "team"]);
  });

  it("Pro and Team are trial-eligible", () => {
    expect(isTrialEligiblePlan("pro")).toBe(true);
    expect(isTrialEligiblePlan("team")).toBe(true);
  });

  it("Free, Business, Enterprise are NOT trial-eligible", () => {
    expect(isTrialEligiblePlan("free")).toBe(false);
    expect(isTrialEligiblePlan("business")).toBe(false);
    expect(isTrialEligiblePlan("enterprise")).toBe(false);
  });

  it("unknown / retired / malformed / empty / null / undefined fail closed to false", () => {
    for (const v of ["", "PRO", "pro ", "solo", "premium", "trial", "unknown", "pro;team"]) {
      expect(isTrialEligiblePlan(v)).toBe(false);
    }
    expect(isTrialEligiblePlan(null)).toBe(false);
    expect(isTrialEligiblePlan(undefined)).toBe(false);
  });

  it("recommended length is 14 days and the hard cap is 365", () => {
    expect(RECOMMENDED_TRIAL_PERIOD_DAYS).toBe(14);
    expect(MAX_TRIAL_PERIOD_DAYS).toBe(365);
  });
});
