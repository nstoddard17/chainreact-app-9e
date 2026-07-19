/**
 * @jest-environment node
 *
 * Advanced-branching plan policy (BRANCH-ENT-1) — the pure tier/status decision.
 *
 * Business rule protected: advanced branching (If/Then Condition, Router) is a Pro+
 * capability. Free is denied; Pro/Team/Business/Enterprise are allowed while the
 * billing status is live (active / trialing / past_due). Canceled or incomplete
 * subscriptions — including an ended trial that never converted — are denied. A
 * wrong answer here either gives Free accounts a paid feature or blocks paying
 * customers.
 */

import {
  PLAN_STATUSES,
  PLAN_TIERS,
  canUseAdvancedBranchingForPlan,
  isAdvancedBranchingEntitled,
  planCapabilitiesFor,
  planStatusRetainsPaidCapabilities,
  type PlanStatus,
  type PlanTier,
} from "@/core/billing/planPolicy";

describe("canUseAdvancedBranchingForPlan", () => {
  const expected: Record<PlanTier, boolean> = {
    free: false,
    pro: true,
    team: true,
    business: true,
    enterprise: true,
  };

  it.each(PLAN_TIERS.map((p) => [p, expected[p]] as const))(
    "%s → %s",
    (plan, allowed) => {
      expect(canUseAdvancedBranchingForPlan(plan)).toBe(allowed);
      expect(planCapabilitiesFor(plan).canUseAdvancedBranching).toBe(allowed);
    },
  );
});

describe("planStatusRetainsPaidCapabilities", () => {
  const expected: Record<PlanStatus, boolean> = {
    active: true,
    trialing: true,
    past_due: true, // warn-first grace window, matches deriveBillingLifecycle
    canceled: false,
    incomplete: false,
  };

  it.each(PLAN_STATUSES.map((s) => [s, expected[s]] as const))(
    "%s → %s",
    (status, retained) => {
      expect(planStatusRetainsPaidCapabilities(status)).toBe(retained);
    },
  );
});

describe("isAdvancedBranchingEntitled (tier × status)", () => {
  const cases: Array<[PlanTier, PlanStatus, boolean, string]> = [
    ["free", "active", false, "Free is denied even with an active status"],
    ["free", "trialing", false, "Free tier never gains branching from a status"],
    ["pro", "active", true, "paid Pro"],
    ["pro", "trialing", true, "active Pro trial"],
    ["team", "trialing", true, "active Team trial"],
    ["team", "active", true, "paid Team"],
    ["business", "active", true, "paid Business"],
    ["enterprise", "active", true, "paid Enterprise"],
    ["pro", "past_due", true, "payment retrying keeps the grace window"],
    ["pro", "canceled", false, "canceled subscription (incl. ended, unconverted trial)"],
    ["team", "canceled", false, "canceled Team subscription"],
    ["pro", "incomplete", false, "incomplete signup never entitles"],
  ];

  it.each(cases)("%s + %s → %s (%s)", (plan, status, entitled) => {
    expect(isAdvancedBranchingEntitled(plan, status)).toBe(entitled);
  });
});
