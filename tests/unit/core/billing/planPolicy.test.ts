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
  isPlanTier,
  isPlanStatus,
  isPlanAllowedForType,
  isUpgradeAllowedForType,
  upgradeTargetAccountType,
  defaultPlanForAccountType,
  planTierLabel,
} from "@/core/billing/planPolicy";
import {
  memberLimitFor,
  TEAM_MAX_MEMBERS,
  BUSINESS_MAX_MEMBERS,
} from "@/services/accounts/memberLimits";
import { folderLimitFor, FOLDER_LIMITS } from "@/services/workflowFolders/folderLimits";
import { isPlatformBillingEnabled, PLATFORM_BILLING_FLAG } from "@/services/billing/billingFeatureFlags";

describe("planPolicy — tiers + limits", () => {
  it("knows exactly the five tiers + five statuses", () => {
    expect([...PLAN_TIERS]).toEqual(["free", "pro", "team", "business", "enterprise"]);
    expect([...PLAN_STATUSES]).toEqual(["active", "trialing", "past_due", "canceled", "incomplete"]);
  });

  it("carries the launch limit numbers (Pro task cap raised in CS-PRO-2)", () => {
    expect(planLimitsFor("free")).toEqual({ memberLimit: 1, folderLimit: 10, taskLimit: 100 });
    // CS-PRO-2: Pro keeps Free's member/folder caps but gets a higher monthly task cap.
    expect(planLimitsFor("pro")).toEqual({ memberLimit: 1, folderLimit: 10, taskLimit: 1000 });
    expect(planLimitsFor("team")).toEqual({ memberLimit: 5, folderLimit: 100, taskLimit: 100 });
    expect(planLimitsFor("business")).toEqual({ memberLimit: 25, folderLimit: 250, taskLimit: 100 });
    expect(planLimitsFor("enterprise")).toEqual({ memberLimit: null, folderLimit: null, taskLimit: null });
  });

  it("Pro's task cap is higher than Free's (the CS-PRO-2 benefit), member/folder caps equal", () => {
    expect(planLimitsFor("pro").taskLimit).toBe(1000);
    expect(planLimitsFor("free").taskLimit).toBe(100);
    expect(planLimitsFor("pro").memberLimit).toBe(planLimitsFor("free").memberLimit);
    expect(planLimitsFor("pro").folderLimit).toBe(planLimitsFor("free").folderLimit);
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

describe("platform billing flag", () => {
  const prev = process.env[PLATFORM_BILLING_FLAG];
  afterEach(() => {
    if (prev === undefined) delete process.env[PLATFORM_BILLING_FLAG];
    else process.env[PLATFORM_BILLING_FLAG] = prev;
  });

  it("defaults OFF", () => {
    delete process.env[PLATFORM_BILLING_FLAG];
    expect(isPlatformBillingEnabled()).toBe(false);
  });

  it("is ON only when set exactly to 'true'", () => {
    process.env[PLATFORM_BILLING_FLAG] = "true";
    expect(isPlatformBillingEnabled()).toBe(true);
    process.env[PLATFORM_BILLING_FLAG] = "1";
    expect(isPlatformBillingEnabled()).toBe(false);
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
