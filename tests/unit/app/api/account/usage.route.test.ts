/**
 * @jest-environment node
 *
 * Route tests for GET /api/account/usage — the app-shell header usage meter
 * (HEADER-USAGE-VISIBILITY-1). Mocks the active-account auth chokepoint + the
 * two billing repos so the route's own behavior is isolated: auth gate →
 * fail-open per-dimension reads → display-safe `computeAccountUsageSummary`
 * response (the summary math itself is proven in
 * tests/unit/core/billing — this file only asserts the route wiring).
 */

const mockRequireUserWithAccount = jest.fn();
jest.mock("@/app/api/workflows/_shared", () => ({
  requireUserWithAccount: (...a: unknown[]) => mockRequireUserWithAccount(...a),
}));

const mockGetUsage = jest.fn();
const mockGetBillingMode = jest.fn();
jest.mock("@/repositories/accountBilling", () => ({
  getUsage: (...a: unknown[]) => mockGetUsage(...a),
  getBillingModeServiceRole: (...a: unknown[]) => mockGetBillingMode(...a),
}));

const mockGetAiCreditUsage = jest.fn();
jest.mock("@/repositories/accountBillingAiCredits", () => ({
  getAiCreditUsage: (...a: unknown[]) => mockGetAiCreditUsage(...a),
}));

import { NextResponse } from "next/server";
import { GET } from "@/app/api/account/usage/route";

const ACCOUNT = "11111111-1111-4111-8111-111111111111";

function authedAs(accountId: string) {
  mockRequireUserWithAccount.mockResolvedValueOnce({
    ok: true,
    userId: "user-1",
    accountId,
  });
}

beforeEach(() => {
  mockRequireUserWithAccount.mockReset();
  mockGetUsage.mockReset();
  mockGetBillingMode.mockReset();
  mockGetAiCreditUsage.mockReset();
  mockGetBillingMode.mockResolvedValue("standard");
});

describe("GET /api/account/usage", () => {
  it("returns the auth failure response untouched and never reads billing", async () => {
    const denied = NextResponse.json({ error: "unauthorized" }, { status: 401 });
    mockRequireUserWithAccount.mockResolvedValueOnce({ ok: false, response: denied });
    const res = await GET();
    expect(res.status).toBe(401);
    expect(mockGetUsage).not.toHaveBeenCalled();
    expect(mockGetAiCreditUsage).not.toHaveBeenCalled();
  });

  it("returns both dimensions' display-safe summary for the ACTIVE account", async () => {
    authedAs(ACCOUNT);
    // Current period (period anchor = now) so lazy-rollover math is a no-op.
    const periodStartedAt = new Date().toISOString();
    mockGetUsage.mockResolvedValueOnce({
      tasksUsed: 30,
      tasksLimit: 100,
      periodStartedAt,
      plan: "free",
      planStatus: "active",
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });
    mockGetAiCreditUsage.mockResolvedValueOnce({
      aiCreditsUsed: 5,
      aiCreditsLimit: 200,
      aiCreditsRemaining: 195,
      aiCreditsPeriodStartedAt: periodStartedAt,
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(mockGetUsage).toHaveBeenCalledWith(ACCOUNT);
    expect(mockGetAiCreditUsage).toHaveBeenCalledWith(ACCOUNT);
    expect(body.usage.tasks).toMatchObject({
      available: true,
      used: 30,
      limit: 100,
      remaining: 70,
    });
    expect(body.usage.aiCredits).toMatchObject({
      available: true,
      used: 5,
      limit: 200,
      remaining: 195,
    });
    expect(body.usage.internalFree).toBe(false);
    // No-leak: counts/booleans only — never Stripe ids or plan audit fields.
    const raw = JSON.stringify(body);
    expect(raw).not.toMatch(/stripe/i);
    expect(raw).not.toMatch(/cus_|sub_/);
  });

  it("fails open per dimension: a throwing read → available:false, 200, never faked zeros-as-real", async () => {
    authedAs(ACCOUNT);
    mockGetUsage.mockRejectedValueOnce(new Error("boom"));
    mockGetAiCreditUsage.mockRejectedValueOnce(new Error("boom"));
    mockGetBillingMode.mockRejectedValueOnce(new Error("boom"));

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.usage.tasks.available).toBe(false);
    expect(body.usage.aiCredits.available).toBe(false);
    expect(body.usage.billingMode).toBe("standard");
  });

  it("surfaces internal_free as the coarse display mode", async () => {
    authedAs(ACCOUNT);
    mockGetUsage.mockResolvedValueOnce(null);
    mockGetAiCreditUsage.mockResolvedValueOnce(null);
    mockGetBillingMode.mockReset();
    mockGetBillingMode.mockResolvedValueOnce("internal_free");

    const body = await (await GET()).json();
    expect(body.usage.internalFree).toBe(true);
  });
});
