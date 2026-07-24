/**
 * @jest-environment node
 *
 * Slice 4.BILLING-PERSONAL-PRO-TEAM-CHOICE-2 / PPT-1 — personal-plan service. Mocks the
 * account read, billing reads, downgrade preview, and the platform Stripe client. Proves
 * personal-only + freeze gating, the safe state shape (no Stripe ids), the period-end
 * cancel mutation (set/undo, idempotent, no plan/status write), and typed errors.
 */

const mockGetAccount = jest.fn();
jest.mock("@/repositories/accounts", () => ({
  getByIdServiceRole: (...a: unknown[]) => mockGetAccount(...a),
}));

const mockGetUsage = jest.fn();
const mockGetAttachment = jest.fn();
// `getBillingModeServiceRole` is read by the canonical cancellation service this module now
// delegates to (ACCOUNT-BILLING-LIFECYCLE-1).
const mockGetBillingMode = jest.fn();
jest.mock("@/repositories/accountBilling", () => ({
  getUsage: (...a: unknown[]) => mockGetUsage(...a),
  getStripeAttachmentServiceRole: (...a: unknown[]) => mockGetAttachment(...a),
  getBillingModeServiceRole: (...a: unknown[]) => mockGetBillingMode(...a),
}));

const mockPreview = jest.fn();
jest.mock("@/services/billing/downgradePreview", () => ({
  previewDowngrade: (...a: unknown[]) => mockPreview(...a),
}));

const mockGetClient = jest.fn();
jest.mock("@/services/billing/platformStripeClient", () => ({
  ...jest.requireActual("@/services/billing/platformStripeClient"),
  getPlatformStripeClient: () => mockGetClient(),
}));

import {
  getPersonalPlanState,
  setPersonalCancelAtPeriodEnd,
} from "@/services/billing/personalPlan";
import { PlatformStripeConfigError } from "@/services/billing/platformStripeClient";

const ACCOUNT = "acct-1";

function personal(deletionStatus = "active") {
  return { id: ACCOUNT, type: "personal", deletionStatus, name: "P", ownerUserId: "u1" };
}
function usage(over: Record<string, unknown> = {}) {
  return {
    tasksUsed: 1,
    tasksLimit: 100,
    periodStartedAt: "2026-06-01T00:00:00Z",
    plan: "pro",
    planStatus: "active",
    currentPeriodEnd: "2026-07-01T00:00:00Z",
    cancelAtPeriodEnd: false,
    ...over,
  };
}

beforeEach(() => {
  mockGetAccount.mockReset();
  mockGetUsage.mockReset();
  mockGetAttachment.mockReset();
  mockGetBillingMode.mockReset().mockResolvedValue("standard");
  mockPreview.mockReset().mockResolvedValue({ ok: true, blockers: [] });
  mockGetClient.mockReset();
});

describe("getPersonalPlanState", () => {
  it("account_not_found when missing", async () => {
    mockGetAccount.mockResolvedValueOnce(null);
    expect(await getPersonalPlanState(ACCOUNT)).toEqual({ ok: false, reason: "account_not_found" });
  });

  it("not_personal for a team/org account (no billing reads)", async () => {
    mockGetAccount.mockResolvedValueOnce({ ...personal(), type: "team" });
    const r = await getPersonalPlanState(ACCOUNT);
    expect(r).toEqual({ ok: false, reason: "not_personal" });
    expect(mockGetUsage).not.toHaveBeenCalled();
  });

  it("reports paid Pro when plan=pro + active + a subscription exists", async () => {
    mockGetAccount.mockResolvedValueOnce(personal());
    mockGetUsage.mockResolvedValueOnce(usage());
    mockGetAttachment.mockResolvedValueOnce({ stripeSubscriptionId: "sub_1", stripeCustomerId: "cus_1", cancelAtPeriodEnd: false, currentPeriodEnd: null });
    const r = await getPersonalPlanState(ACCOUNT);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.isPaidPersonalPro).toBe(true);
    expect(r.state.plan).toBe("pro");
    expect(r.state.downgrade).toEqual({ allowed: true, blockers: [] });
    // NEVER leak Stripe ids.
    const serialized = JSON.stringify(r.state);
    expect(serialized).not.toContain("sub_1");
    expect(serialized).not.toContain("cus_1");
    expect(serialized).not.toContain("stripe");
  });

  it("is NOT paid Pro without a subscription id", async () => {
    mockGetAccount.mockResolvedValueOnce(personal());
    mockGetUsage.mockResolvedValueOnce(usage());
    mockGetAttachment.mockResolvedValueOnce({ stripeSubscriptionId: null, stripeCustomerId: null, cancelAtPeriodEnd: false, currentPeriodEnd: null });
    const r = await getPersonalPlanState(ACCOUNT);
    expect(r.ok && r.state.isPaidPersonalPro).toBe(false);
  });

  it("includes a downgrade preview with blockers when over Free limits", async () => {
    mockGetAccount.mockResolvedValueOnce(personal());
    mockGetUsage.mockResolvedValueOnce(usage());
    mockGetAttachment.mockResolvedValueOnce({ stripeSubscriptionId: "sub_1", cancelAtPeriodEnd: false, currentPeriodEnd: null });
    mockPreview.mockResolvedValueOnce({ ok: false, blockers: [{ kind: "folders", current: 25, limit: 10 }] });
    const r = await getPersonalPlanState(ACCOUNT);
    expect(r.ok && r.state.downgrade.allowed).toBe(false);
    expect(r.ok && r.state.downgrade.blockers).toHaveLength(1);
  });
});

/**
 * ACCOUNT-BILLING-LIFECYCLE-1: the Stripe work is DELEGATED to the canonical
 * `subscriptionCancellation` service, so the flow is now GET (read live state) → POST (only
 * when the value actually changes). These tests assert the personal-only product gate and
 * that the delegation reaches the right subscription with the right payload; the canonical
 * service's own edge cases live in `subscriptionCancellation.test.ts`.
 */
describe("setPersonalCancelAtPeriodEnd", () => {
  /** Live-subscription GET followed by the mutation POST. */
  function clientOk(liveCancelAtPeriodEnd = false) {
    const request = jest
      .fn()
      .mockResolvedValueOnce({
        id: "sub_1",
        status: "active",
        cancel_at_period_end: liveCancelAtPeriodEnd,
        current_period_end: 1785_000_000,
      })
      .mockResolvedValueOnce({
        id: "sub_1",
        status: "active",
        cancel_at_period_end: !liveCancelAtPeriodEnd,
        current_period_end: 1785_000_000,
      });
    mockGetClient.mockReturnValue({ apiBase: "x", apiVersion: "v", request });
    return request;
  }

  it("account_not_found / not_personal / account_frozen", async () => {
    mockGetAccount.mockResolvedValueOnce(null);
    expect(await setPersonalCancelAtPeriodEnd(ACCOUNT, true)).toEqual({ ok: false, reason: "account_not_found" });
    mockGetAccount.mockResolvedValueOnce({ ...personal(), type: "organization" });
    expect(await setPersonalCancelAtPeriodEnd(ACCOUNT, true)).toEqual({ ok: false, reason: "not_personal" });
    mockGetAccount.mockResolvedValue(personal("pending_deletion"));
    expect(await setPersonalCancelAtPeriodEnd(ACCOUNT, true)).toEqual({ ok: false, reason: "account_frozen" });
  });

  it("no_subscription when the personal account has no Stripe subscription", async () => {
    mockGetAccount.mockResolvedValue(personal());
    mockGetAttachment.mockResolvedValue({ stripeSubscriptionId: null });
    const r = await setPersonalCancelAtPeriodEnd(ACCOUNT, true);
    expect(r).toEqual({ ok: false, reason: "no_subscription" });
    expect(mockGetClient).not.toHaveBeenCalled();
  });

  it("internal_account is refused without a Stripe call", async () => {
    mockGetAccount.mockResolvedValue(personal());
    mockGetAttachment.mockResolvedValue({ stripeSubscriptionId: "sub_1" });
    mockGetBillingMode.mockResolvedValue("internal_free");
    expect(await setPersonalCancelAtPeriodEnd(ACCOUNT, true)).toEqual({
      ok: false,
      reason: "internal_account",
    });
    expect(mockGetClient).not.toHaveBeenCalled();
  });

  it("stripe_not_configured when the platform client has no secret", async () => {
    mockGetAccount.mockResolvedValue(personal());
    mockGetAttachment.mockResolvedValue({ stripeSubscriptionId: "sub_1" });
    mockGetClient.mockImplementation(() => {
      throw new PlatformStripeConfigError("no key");
    });
    expect(await setPersonalCancelAtPeriodEnd(ACCOUNT, true)).toEqual({ ok: false, reason: "stripe_not_configured" });
  });

  it("sets cancel_at_period_end=true on the existing subscription and returns the effective date", async () => {
    mockGetAccount.mockResolvedValue(personal());
    mockGetAttachment.mockResolvedValue({ stripeSubscriptionId: "sub_1" });
    const request = clientOk(false);
    const r = await setPersonalCancelAtPeriodEnd(ACCOUNT, true);
    expect(r).toEqual({
      ok: true,
      cancelAtPeriodEnd: true,
      effectiveAt: new Date(1785_000_000 * 1000).toISOString(),
    });
    expect(request).toHaveBeenNthCalledWith(1, {
      method: "GET",
      path: "/v1/subscriptions/sub_1",
    });
    expect(request).toHaveBeenNthCalledWith(2, {
      method: "POST",
      path: "/v1/subscriptions/sub_1",
      body: { cancel_at_period_end: true },
    });
  });

  it("undo: sets cancel_at_period_end=false", async () => {
    mockGetAccount.mockResolvedValue(personal());
    mockGetAttachment.mockResolvedValue({ stripeSubscriptionId: "sub_1" });
    const request = clientOk(true);
    const r = await setPersonalCancelAtPeriodEnd(ACCOUNT, false);
    expect(r).toEqual({ ok: true, cancelAtPeriodEnd: false, effectiveAt: null });
    expect(request).toHaveBeenNthCalledWith(2, {
      method: "POST",
      path: "/v1/subscriptions/sub_1",
      body: { cancel_at_period_end: false },
    });
  });

  it("is idempotent — a repeat cancel makes no Stripe write", async () => {
    mockGetAccount.mockResolvedValue(personal());
    mockGetAttachment.mockResolvedValue({ stripeSubscriptionId: "sub_1" });
    const request = jest.fn().mockResolvedValue({
      id: "sub_1",
      status: "active",
      cancel_at_period_end: true,
      current_period_end: 1785_000_000,
    });
    mockGetClient.mockReturnValue({ apiBase: "x", apiVersion: "v", request });

    const r = await setPersonalCancelAtPeriodEnd(ACCOUNT, true);
    expect(r).toMatchObject({ ok: true, cancelAtPeriodEnd: true });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toMatchObject({ method: "GET" });
  });

  it("reports subscription_already_ended for a dead subscription", async () => {
    mockGetAccount.mockResolvedValue(personal());
    mockGetAttachment.mockResolvedValue({ stripeSubscriptionId: "sub_1" });
    const request = jest
      .fn()
      .mockResolvedValue({ id: "sub_1", status: "canceled", cancel_at_period_end: false });
    mockGetClient.mockReturnValue({ apiBase: "x", apiVersion: "v", request });
    expect(await setPersonalCancelAtPeriodEnd(ACCOUNT, true)).toEqual({
      ok: false,
      reason: "subscription_already_ended",
    });
  });
});
