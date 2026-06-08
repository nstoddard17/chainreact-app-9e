/**
 * @jest-environment node
 *
 * Account plan + capability resolver (CS-XT-1). Mocks the lean `accountBilling.getPlan` read and
 * asserts the resolver uses the ACTUAL stored plan (not the account-type default), fails closed to
 * "free" when the plan can't be read, and never returns a Stripe identifier.
 */

const mockGetPlan = jest.fn();
jest.mock("@/repositories/accountBilling", () => ({
  getPlan: (...a: unknown[]) => mockGetPlan(...a),
}));

import {
  resolveAccountPlan,
  resolveAccountCapabilities,
} from "@/services/billing/planCapabilities";

beforeEach(() => {
  mockGetPlan.mockReset();
});

describe("resolveAccountPlan", () => {
  it("returns the actual stored plan (Pro), not a type default", async () => {
    mockGetPlan.mockResolvedValueOnce("pro");
    const r = await resolveAccountPlan("acct-1");
    expect(r).toEqual({ plan: "pro", fallback: false });
    expect(mockGetPlan).toHaveBeenCalledWith("acct-1");
  });

  it("resolves Team and Business from the stored plan", async () => {
    mockGetPlan.mockResolvedValueOnce("team");
    expect(await resolveAccountPlan("t")).toEqual({ plan: "team", fallback: false });
    mockGetPlan.mockResolvedValueOnce("business");
    expect(await resolveAccountPlan("b")).toEqual({ plan: "business", fallback: false });
  });

  it("fails closed to free when no billing row exists (null)", async () => {
    mockGetPlan.mockResolvedValueOnce(null);
    expect(await resolveAccountPlan("acct-1")).toEqual({ plan: "free", fallback: true });
  });

  it("fails closed to free when the read throws", async () => {
    mockGetPlan.mockRejectedValueOnce(new Error("db down"));
    expect(await resolveAccountPlan("acct-1")).toEqual({ plan: "free", fallback: true });
  });
});

describe("resolveAccountCapabilities", () => {
  it("personal Pro resolves PRO capabilities (bulk export + create templates), not Free", async () => {
    mockGetPlan.mockResolvedValueOnce("pro");
    const r = await resolveAccountCapabilities("acct-pro");
    expect(r.plan).toBe("pro");
    expect(r.fallback).toBe(false);
    expect(r.capabilities).toEqual({
      plan: "pro",
      canBulkExport: true,
      canCreateTemplates: true,
      canUseBuiltInTemplates: true,
    });
  });

  it("Free account: no bulk export, no custom templates, built-ins allowed", async () => {
    mockGetPlan.mockResolvedValueOnce("free");
    const r = await resolveAccountCapabilities("acct-free");
    expect(r.capabilities).toEqual({
      plan: "free",
      canBulkExport: false,
      canCreateTemplates: false,
      canUseBuiltInTemplates: true,
    });
  });

  it("Business resolves Business capabilities", async () => {
    mockGetPlan.mockResolvedValueOnce("business");
    const r = await resolveAccountCapabilities("acct-biz");
    expect(r.plan).toBe("business");
    expect(r.capabilities.canBulkExport).toBe(true);
    expect(r.capabilities.canCreateTemplates).toBe(true);
  });

  it("read failure falls back to free capabilities (fail closed)", async () => {
    mockGetPlan.mockRejectedValueOnce(new Error("boom"));
    const r = await resolveAccountCapabilities("acct-x");
    expect(r.plan).toBe("free");
    expect(r.fallback).toBe(true);
    expect(r.capabilities.canBulkExport).toBe(false);
  });

  it("returns ONLY plan + capability data — no Stripe ids anywhere in the DTO", async () => {
    mockGetPlan.mockResolvedValueOnce("team");
    const r = await resolveAccountCapabilities("acct-team");
    const blob = JSON.stringify(r).toLowerCase();
    expect(blob).not.toContain("stripe");
    expect(blob).not.toContain("customer");
    expect(blob).not.toContain("subscription");
    expect(Object.keys(r).sort()).toEqual(["capabilities", "fallback", "plan"]);
  });
});
