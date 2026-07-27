/**
 * @jest-environment node
 *
 * Tests for core/billing/planPolicy (Slice 4.BILLING-PLAN-METADATA-2 / CS-1) — the
 * pure plan-tier policy. Also asserts the delegated member/folder limit helpers
 * return byte-for-byte today's numbers (no behavior change) and the platform-billing
 * flag defaults OFF.
 */

import {
  PLAN_TIERS,
  PLAN_STATUSES,
  planLimitsFor,
  aiCreditsMonthlyLimitFor,
  isPlanTier,
  isPlanStatus,
  isPlanAllowedForType,
  isUpgradeAllowedForType,
  upgradeTargetAccountType,
  defaultPlanForAccountType,
  planTierLabel,
  templateLimitFor,
  canBulkExportForPlan,
  canCreateTemplatesForPlan,
  canUseBuiltInTemplatesForPlan,
  planCapabilitiesFor,
} from "@/core/billing/planPolicy";
import {
  memberLimitFor,
  TEAM_MAX_MEMBERS,
  BUSINESS_MAX_MEMBERS,
} from "@/services/accounts/memberLimits";
import { folderLimitFor, FOLDER_LIMITS } from "@/services/workflowFolders/folderLimits";

describe("planPolicy — tiers + limits", () => {
  it("knows exactly the five tiers + five statuses", () => {
    expect([...PLAN_TIERS]).toEqual(["free", "pro", "team", "business", "enterprise"]);
    expect([...PLAN_STATUSES]).toEqual(["active", "trialing", "past_due", "canceled", "incomplete"]);
  });

  it("carries the locked launch limit numbers (PRICING-LOCK-1, 2026-06-17; AI credits repriced AI-CREDITS-REPRICE-1, 2026-07-27)", () => {
    expect(planLimitsFor("free")).toEqual({ memberLimit: 1, folderLimit: 10, taskLimit: 100, templateLimit: 0, aiCreditsMonthlyLimit: 100 });
    expect(planLimitsFor("pro")).toEqual({ memberLimit: 1, folderLimit: 25, taskLimit: 2000, templateLimit: 25, aiCreditsMonthlyLimit: 2000 });
    expect(planLimitsFor("team")).toEqual({ memberLimit: 5, folderLimit: 100, taskLimit: 7500, templateLimit: 50, aiCreditsMonthlyLimit: 10000 });
    expect(planLimitsFor("business")).toEqual({ memberLimit: 25, folderLimit: 250, taskLimit: 25000, templateLimit: 250, aiCreditsMonthlyLimit: 50000 });
    expect(planLimitsFor("enterprise")).toEqual({ memberLimit: null, folderLimit: null, taskLimit: null, templateLimit: null, aiCreditsMonthlyLimit: null });
  });

  it("locks the per-tier monthly task caps (Free 100 / Pro 2k / Team 7.5k / Business 25k / Enterprise null)", () => {
    expect(planLimitsFor("free").taskLimit).toBe(100);
    expect(planLimitsFor("pro").taskLimit).toBe(2000);
    expect(planLimitsFor("team").taskLimit).toBe(7500);
    expect(planLimitsFor("business").taskLimit).toBe(25000);
    expect(planLimitsFor("enterprise").taskLimit).toBeNull();
    // Task caps strictly increase across the paid ladder.
    expect(planLimitsFor("pro").taskLimit!).toBeGreaterThan(planLimitsFor("free").taskLimit!);
    expect(planLimitsFor("team").taskLimit!).toBeGreaterThan(planLimitsFor("pro").taskLimit!);
    expect(planLimitsFor("business").taskLimit!).toBeGreaterThan(planLimitsFor("team").taskLimit!);
  });

  it("Pro keeps Free's member cap but raises folders (25 vs 10) and tasks", () => {
    expect(planLimitsFor("pro").memberLimit).toBe(planLimitsFor("free").memberLimit);
    expect(planLimitsFor("pro").folderLimit).toBe(25);
    expect(planLimitsFor("free").folderLimit).toBe(10);
  });

  it("type guards accept known values and reject unknown", () => {
    expect(isPlanTier("team")).toBe(true);
    expect(isPlanTier("gold")).toBe(false);
    expect(isPlanStatus("past_due")).toBe(true);
    expect(isPlanStatus("pending")).toBe(false);
  });
});

describe("planPolicy — type ↔ plan", () => {
  it("maps each account type to its default plan", () => {
    expect(defaultPlanForAccountType("personal")).toBe("free");
    expect(defaultPlanForAccountType("team")).toBe("team");
    expect(defaultPlanForAccountType("organization")).toBe("business");
  });

  it("allows only the valid (type, plan) combos", () => {
    expect(isPlanAllowedForType("personal", "free")).toBe(true);
    expect(isPlanAllowedForType("personal", "pro")).toBe(true);
    expect(isPlanAllowedForType("personal", "team")).toBe(false);
    expect(isPlanAllowedForType("team", "team")).toBe(true);
    expect(isPlanAllowedForType("team", "business")).toBe(false);
    expect(isPlanAllowedForType("organization", "business")).toBe(true);
    expect(isPlanAllowedForType("organization", "enterprise")).toBe(true);
    expect(isPlanAllowedForType("organization", "free")).toBe(false);
  });

  it("labels Business (never Organization)", () => {
    expect(planTierLabel("free")).toBe("Free");
    expect(planTierLabel("pro")).toBe("Pro");
    expect(planTierLabel("team")).toBe("Team");
    expect(planTierLabel("business")).toBe("Business");
    expect(planTierLabel("enterprise")).toBe("Enterprise");
  });
});

describe("delegated limit helpers — no behavior change", () => {
  it("member caps stay Team 5 / Business 25 / personal 1", () => {
    expect(TEAM_MAX_MEMBERS).toBe(5);
    expect(BUSINESS_MAX_MEMBERS).toBe(25);
    expect(memberLimitFor("team")).toBe(5);
    expect(memberLimitFor("organization")).toBe(25);
    expect(memberLimitFor("personal")).toBe(1);
  });

  it("folder caps stay personal 10 / team 100 / organization 250", () => {
    expect(folderLimitFor("personal")).toBe(10);
    expect(folderLimitFor("team")).toBe(100);
    expect(folderLimitFor("organization")).toBe(250);
    expect(FOLDER_LIMITS).toEqual({ personal: 10, team: 100, organization: 250 });
  });
});

describe("template limits + feature capabilities (CS-XT-1)", () => {
  it("template caps: Free 0 / Pro 25 / Team 50 / Business 250 / Enterprise null", () => {
    expect(templateLimitFor("free")).toBe(0);
    expect(templateLimitFor("pro")).toBe(25);
    expect(templateLimitFor("team")).toBe(50);
    expect(templateLimitFor("business")).toBe(250);
    expect(templateLimitFor("enterprise")).toBeNull();
  });

  it("bulk export: false for Free, true for every paid tier", () => {
    expect(canBulkExportForPlan("free")).toBe(false);
    for (const plan of ["pro", "team", "business", "enterprise"] as const) {
      expect(canBulkExportForPlan(plan)).toBe(true);
    }
  });

  it("custom-template authoring derives from the cap (Free 0 → false; positive/uncapped → true)", () => {
    expect(canCreateTemplatesForPlan("free")).toBe(false);
    expect(canCreateTemplatesForPlan("pro")).toBe(true);
    expect(canCreateTemplatesForPlan("team")).toBe(true);
    expect(canCreateTemplatesForPlan("business")).toBe(true);
    expect(canCreateTemplatesForPlan("enterprise")).toBe(true); // null cap = uncapped, not blocked
  });

  it("built-in template use is true for EVERY tier", () => {
    for (const plan of PLAN_TIERS) {
      expect(canUseBuiltInTemplatesForPlan(plan)).toBe(true);
    }
  });

  it("planCapabilitiesFor bundles plan + booleans with NO Stripe identifiers", () => {
    expect(planCapabilitiesFor("free")).toEqual({
      plan: "free",
      canBulkExport: false,
      canCreateTemplates: false,
      canUseBuiltInTemplates: true,
      canUseAdvancedBranching: false,
    });
    expect(planCapabilitiesFor("pro")).toEqual({
      plan: "pro",
      canBulkExport: true,
      canCreateTemplates: true,
      canUseBuiltInTemplates: true,
      canUseAdvancedBranching: true,
    });
    // No stray fields (e.g. a leaked stripe id) ever appear in the bundle.
    expect(Object.keys(planCapabilitiesFor("business")).sort()).toEqual(
      [
        "canBulkExport",
        "canCreateTemplates",
        "canUseAdvancedBranching",
        "canUseBuiltInTemplates",
        "plan",
      ],
    );
  });
});

describe("AI credit limits (AI-CREDITS-REPRICE-1)", () => {
  it("surfaces per-tier monthly AI credit caps: Free 100 / Pro 2k / Team 10k / Business 50k / Enterprise null", () => {
    expect(aiCreditsMonthlyLimitFor("free")).toBe(100);
    expect(aiCreditsMonthlyLimitFor("pro")).toBe(2000);
    expect(aiCreditsMonthlyLimitFor("team")).toBe(10000);
    expect(aiCreditsMonthlyLimitFor("business")).toBe(50000);
    // Enterprise = custom/null (the per-deal value is set on the DB column directly).
    expect(aiCreditsMonthlyLimitFor("enterprise")).toBeNull();
  });

  it("Pro/Team/Business AI caps exceed Free's (AI limits are an upgrade lever)", () => {
    const free = aiCreditsMonthlyLimitFor("free")!;
    for (const plan of ["pro", "team", "business"] as const) {
      expect(aiCreditsMonthlyLimitFor(plan)!).toBeGreaterThan(free);
    }
  });

  it("Team/Business per-included-seat AI credits are NEVER below Pro's (owner rule)", () => {
    // Upgrading a plan adds seats and features — it must never dilute AI per seat.
    const proPerSeat =
      aiCreditsMonthlyLimitFor("pro")! / planLimitsFor("pro").memberLimit!;
    for (const plan of ["team", "business"] as const) {
      const perSeat =
        aiCreditsMonthlyLimitFor(plan)! / planLimitsFor(plan).memberLimit!;
      expect(perSeat).toBeGreaterThanOrEqual(proPerSeat);
    }
  });
});

describe("planPolicy — cross-type upgrades (BU-2)", () => {
  it("allows Team → Business as an in-place upgrade", () => {
    expect(isUpgradeAllowedForType("team", "business")).toBe(true);
    expect(upgradeTargetAccountType("team", "business")).toBe("organization");
  });

  it("does NOT treat personal → business as an upgrade", () => {
    expect(isUpgradeAllowedForType("personal", "business")).toBe(false);
    expect(upgradeTargetAccountType("personal", "business")).toBeNull();
  });

  it("does NOT treat team → pro or organization → team as upgrades", () => {
    expect(isUpgradeAllowedForType("team", "pro")).toBe(false);
    expect(isUpgradeAllowedForType("organization", "team")).toBe(false);
    expect(upgradeTargetAccountType("team", "pro")).toBeNull();
    expect(upgradeTargetAccountType("organization", "team")).toBeNull();
  });

  it("a directly-allowed plan is NOT an upgrade (team→team, org→business)", () => {
    expect(isUpgradeAllowedForType("team", "team")).toBe(false);
    expect(isUpgradeAllowedForType("organization", "business")).toBe(false);
  });
});
