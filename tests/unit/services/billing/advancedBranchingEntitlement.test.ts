/**
 * @jest-environment node
 *
 * Advanced-branching entitlement resolver (BRANCH-ENT-1).
 *
 * Business rule protected: every enforcement boundary answers "can the WORKFLOW-OWNING
 * account use advanced branching right now?" through this one resolver, which reads the
 * stored `account_billing.plan` + `plan_status` (never `accounts.type`, never the acting
 * user) and FAILS CLOSED when entitlement cannot be proven. Mocks sit at the repository
 * (DB) boundary only — the tier/status decision under test is the real policy.
 */

const mockGetPlanState = jest.fn();
const mockGetPlanStateServiceRole = jest.fn();
jest.mock("@/repositories/accountBilling", () => ({
  getPlanState: (...a: unknown[]) => mockGetPlanState(...a),
  getPlanStateServiceRole: (...a: unknown[]) => mockGetPlanStateServiceRole(...a),
}));

import {
  resolveAdvancedBranchingEntitlement,
  resolveAdvancedBranchingEntitlementServiceRole,
} from "@/services/billing/advancedBranchingEntitlement";

beforeEach(() => {
  mockGetPlanState.mockReset();
  mockGetPlanStateServiceRole.mockReset();
});

describe("resolveAdvancedBranchingEntitlement (user context)", () => {
  it("Pro + active → entitled, resolved from the requested account id", async () => {
    mockGetPlanState.mockResolvedValueOnce({ plan: "pro", planStatus: "active" });
    const r = await resolveAdvancedBranchingEntitlement("acct-owner");
    expect(r).toEqual({
      entitled: true,
      plan: "pro",
      planStatus: "active",
      fallback: false,
    });
    expect(mockGetPlanState).toHaveBeenCalledWith("acct-owner");
  });

  it("active Pro trial (plan_status=trialing) → entitled", async () => {
    mockGetPlanState.mockResolvedValueOnce({ plan: "pro", planStatus: "trialing" });
    expect((await resolveAdvancedBranchingEntitlement("a")).entitled).toBe(true);
  });

  it("active Team trial → entitled", async () => {
    mockGetPlanState.mockResolvedValueOnce({ plan: "team", planStatus: "trialing" });
    expect((await resolveAdvancedBranchingEntitlement("a")).entitled).toBe(true);
  });

  it("Free → denied even with an active status", async () => {
    mockGetPlanState.mockResolvedValueOnce({ plan: "free", planStatus: "active" });
    const r = await resolveAdvancedBranchingEntitlement("a");
    expect(r.entitled).toBe(false);
    expect(r.plan).toBe("free");
  });

  it("expired trial that reverted to Free → denied", async () => {
    mockGetPlanState.mockResolvedValueOnce({ plan: "free", planStatus: "canceled" });
    expect((await resolveAdvancedBranchingEntitlement("a")).entitled).toBe(false);
  });

  it("canceled subscription with a stale paid tier → denied (status wins)", async () => {
    mockGetPlanState.mockResolvedValueOnce({ plan: "pro", planStatus: "canceled" });
    expect((await resolveAdvancedBranchingEntitlement("a")).entitled).toBe(false);
  });

  it("missing billing row → fail closed (denied, fallback flagged)", async () => {
    mockGetPlanState.mockResolvedValueOnce(null);
    const r = await resolveAdvancedBranchingEntitlement("a");
    expect(r).toEqual({
      entitled: false,
      plan: "free",
      planStatus: null,
      fallback: true,
    });
  });

  it("repository read error → fail closed (denied), never throws to the caller", async () => {
    mockGetPlanState.mockRejectedValueOnce(new Error("db down"));
    const r = await resolveAdvancedBranchingEntitlement("a");
    expect(r.entitled).toBe(false);
    expect(r.fallback).toBe(true);
  });

  it("DTO carries only tier/status/booleans — never Stripe identifiers", async () => {
    mockGetPlanState.mockResolvedValueOnce({ plan: "team", planStatus: "active" });
    const r = await resolveAdvancedBranchingEntitlement("a");
    const blob = JSON.stringify(r).toLowerCase();
    expect(blob).not.toContain("stripe");
    expect(blob).not.toContain("customer");
    expect(blob).not.toContain("subscription");
    expect(Object.keys(r).sort()).toEqual([
      "entitled",
      "fallback",
      "plan",
      "planStatus",
    ]);
  });
});

describe("resolveAdvancedBranchingEntitlementServiceRole (background context)", () => {
  it("uses the service-role read and applies the same decision (Pro active → entitled)", async () => {
    mockGetPlanStateServiceRole.mockResolvedValueOnce({
      plan: "pro",
      planStatus: "active",
    });
    const r = await resolveAdvancedBranchingEntitlementServiceRole("acct-bg");
    expect(r.entitled).toBe(true);
    expect(mockGetPlanStateServiceRole).toHaveBeenCalledWith("acct-bg");
    expect(mockGetPlanState).not.toHaveBeenCalled();
  });

  it("downgraded-to-Free account → denied for background execution", async () => {
    mockGetPlanStateServiceRole.mockResolvedValueOnce({
      plan: "free",
      planStatus: "active",
    });
    expect(
      (await resolveAdvancedBranchingEntitlementServiceRole("a")).entitled,
    ).toBe(false);
  });

  it("missing row or read error → fail closed", async () => {
    mockGetPlanStateServiceRole.mockResolvedValueOnce(null);
    expect(
      (await resolveAdvancedBranchingEntitlementServiceRole("a")).entitled,
    ).toBe(false);
    mockGetPlanStateServiceRole.mockRejectedValueOnce(new Error("boom"));
    const r = await resolveAdvancedBranchingEntitlementServiceRole("a");
    expect(r).toEqual({
      entitled: false,
      plan: "free",
      planStatus: null,
      fallback: true,
    });
  });
});
