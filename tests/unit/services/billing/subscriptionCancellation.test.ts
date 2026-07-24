/**
 * @jest-environment node
 *
 * Slice 4.ACCOUNT-BILLING-LIFECYCLE-1 — the CANONICAL account-scoped subscription
 * cancellation service. Mocks the account/billing reads and the platform Stripe client so no
 * DB and no network is touched.
 *
 * Proves the business behavior the product depends on:
 *   - cancellation is scheduled at PERIOD END and returns the effective date;
 *   - it is account-scoped: every Stripe call targets the subscription of the account id
 *     passed in, and a team account's subscription is never reachable from another account;
 *   - it never writes plan/plan_status (webhook authority) — no billing write happens at all;
 *   - repeated cancel and repeated resume are idempotent (no wasted Stripe write);
 *   - already-ended / no-subscription / internal-billing / trialing / past_due / frozen /
 *     unconfigured states are each handled with an HONEST typed reason, never a fake success
 *     and never a fake error;
 *   - deletion cancels IMMEDIATELY, stamps the "why", and reports failure as failure;
 *   - the purge fail-closed check treats "cannot verify" as unsafe;
 *   - no Stripe id or secret appears in any returned value.
 */

const mockGetAccount = jest.fn();
jest.mock("@/repositories/accounts", () => ({
  getByIdServiceRole: (...a: unknown[]) => mockGetAccount(...a),
}));

const mockGetUsage = jest.fn();
const mockGetAttachment = jest.fn();
const mockGetBillingMode = jest.fn();
jest.mock("@/repositories/accountBilling", () => ({
  getUsage: (...a: unknown[]) => mockGetUsage(...a),
  getStripeAttachmentServiceRole: (...a: unknown[]) => mockGetAttachment(...a),
  getBillingModeServiceRole: (...a: unknown[]) => mockGetBillingMode(...a),
}));

const mockRequest = jest.fn();
const mockGetClient = jest.fn();
/** Default client factory — re-installed in beforeEach so a per-test throw never leaks. */
function stripeClientStub() {
  return {
    apiBase: "https://api.stripe.test",
    apiVersion: "2025-03-31.basil",
    request: (...a: unknown[]) => mockRequest(...a),
  };
}
jest.mock("@/services/billing/platformStripeClient", () => ({
  ...jest.requireActual("@/services/billing/platformStripeClient"),
  getPlatformStripeClient: () => mockGetClient(),
}));

import {
  CANCELED_BY_ACCOUNT_DELETION,
  CANCELED_BY_METADATA_KEY,
  accountHasRenewableSubscription,
  cancelSubscriptionForAccountDeletion,
  getAccountSubscriptionState,
  resumeSubscription,
  scheduleSubscriptionCancellation,
} from "@/services/billing/subscriptionCancellation";
import {
  PlatformStripeApiError,
  PlatformStripeConfigError,
} from "@/services/billing/platformStripeClient";

const PERSONAL_ID = "acct-personal";
const TEAM_ID = "acct-team";
const PERSONAL_SUB = "sub_personal_123";
const TEAM_SUB = "sub_team_999";
const SECRET_LOOKING = "sk_test_should_never_appear";

function account(id: string, type: string, deletionStatus = "active") {
  return { id, type, name: "A", ownerUserId: "u1", deletionStatus };
}

function usage(over: Record<string, unknown> = {}) {
  return {
    tasksUsed: 1,
    tasksLimit: 100,
    periodStartedAt: "2026-07-01T00:00:00.000Z",
    plan: "pro",
    planStatus: "active",
    currentPeriodEnd: "2026-08-01T00:00:00.000Z",
    cancelAtPeriodEnd: false,
    ...over,
  };
}

/** Stripe Subscription GET/POST response (Basil per-item period shape). */
function stripeSub(over: Record<string, unknown> = {}) {
  return {
    id: PERSONAL_SUB,
    status: "active",
    cancel_at_period_end: false,
    items: { data: [{ current_period_end: 1785_000_000 }] },
    ...over,
  };
}

beforeEach(() => {
  mockGetAccount.mockReset();
  mockGetUsage.mockReset();
  mockGetAttachment.mockReset();
  mockGetBillingMode.mockReset();
  mockRequest.mockReset();
  mockGetClient.mockReset();
  mockGetClient.mockImplementation(stripeClientStub);

  mockGetAccount.mockResolvedValue(account(PERSONAL_ID, "personal"));
  mockGetUsage.mockResolvedValue(usage());
  mockGetBillingMode.mockResolvedValue("standard");
  mockGetAttachment.mockResolvedValue({
    stripeCustomerId: "cus_abc",
    stripeSubscriptionId: PERSONAL_SUB,
    cancelAtPeriodEnd: false,
    currentPeriodEnd: "2026-08-01T00:00:00.000Z",
  });
});

// ─── Read: safe state ────────────────────────────────────────────────────────

describe("getAccountSubscriptionState", () => {
  it("reports a cancelable paid subscription without any Stripe round-trip or id", async () => {
    const result = await getAccountSubscriptionState(PERSONAL_ID);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.state).toEqual({
      plan: "pro",
      planStatus: "active",
      hasSubscription: true,
      isCancelable: true,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: "2026-08-01T00:00:00.000Z",
      frozen: false,
      internalBilling: false,
    });
    // A settings read must not depend on Stripe being reachable.
    expect(mockRequest).not.toHaveBeenCalled();
    expect(JSON.stringify(result.state)).not.toContain(PERSONAL_SUB);
    expect(JSON.stringify(result.state)).not.toContain("cus_abc");
  });

  it("is not cancelable on Free, on internal billing, or once already canceled", async () => {
    mockGetUsage.mockResolvedValue(usage({ plan: "free" }));
    let r = await getAccountSubscriptionState(PERSONAL_ID);
    expect(r.ok && r.state.isCancelable).toBe(false);

    mockGetUsage.mockResolvedValue(usage());
    mockGetBillingMode.mockResolvedValue("internal_free");
    r = await getAccountSubscriptionState(PERSONAL_ID);
    expect(r.ok && r.state.isCancelable).toBe(false);
    expect(r.ok && r.state.internalBilling).toBe(true);

    mockGetBillingMode.mockResolvedValue("standard");
    mockGetUsage.mockResolvedValue(usage({ planStatus: "canceled" }));
    r = await getAccountSubscriptionState(PERSONAL_ID);
    expect(r.ok && r.state.isCancelable).toBe(false);
  });

  it("keeps a past_due subscription cancelable — dunning must not trap the customer", async () => {
    mockGetUsage.mockResolvedValue(usage({ planStatus: "past_due" }));
    const r = await getAccountSubscriptionState(PERSONAL_ID);
    expect(r.ok && r.state.isCancelable).toBe(true);
  });

  it("reports a frozen account as frozen", async () => {
    mockGetAccount.mockResolvedValue(account(PERSONAL_ID, "personal", "pending_deletion"));
    const r = await getAccountSubscriptionState(PERSONAL_ID);
    expect(r.ok && r.state.frozen).toBe(true);
  });

  it("404s an unknown account", async () => {
    mockGetAccount.mockResolvedValue(null);
    const r = await getAccountSubscriptionState("nope");
    expect(r).toEqual({ ok: false, reason: "account_not_found" });
  });
});

// ─── Schedule cancellation at period end ─────────────────────────────────────

describe("scheduleSubscriptionCancellation", () => {
  it("sets cancel_at_period_end and returns the effective date", async () => {
    mockRequest
      .mockResolvedValueOnce(stripeSub())
      .mockResolvedValueOnce(stripeSub({ cancel_at_period_end: true }));

    const result = await scheduleSubscriptionCancellation(PERSONAL_ID);
    expect(result).toEqual({
      ok: true,
      cancelAtPeriodEnd: true,
      effectiveAt: new Date(1785_000_000 * 1000).toISOString(),
      alreadyInState: false,
    });

    const [, write] = mockRequest.mock.calls;
    expect(write[0]).toMatchObject({
      method: "POST",
      path: `/v1/subscriptions/${PERSONAL_SUB}`,
      body: { cancel_at_period_end: true },
    });
  });

  it("is idempotent — a second cancel performs NO Stripe write", async () => {
    mockRequest.mockResolvedValue(stripeSub({ cancel_at_period_end: true }));

    const result = await scheduleSubscriptionCancellation(PERSONAL_ID);
    expect(result).toMatchObject({ ok: true, cancelAtPeriodEnd: true, alreadyInState: true });
    // Read only — no POST.
    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(mockRequest.mock.calls[0][0]).toMatchObject({ method: "GET" });
  });

  it("never writes plan or plan_status locally (webhook authority)", async () => {
    mockRequest
      .mockResolvedValueOnce(stripeSub())
      .mockResolvedValueOnce(stripeSub({ cancel_at_period_end: true }));
    await scheduleSubscriptionCancellation(PERSONAL_ID);
    // The module has no billing-write import at all; assert the read-only surface held.
    expect(mockGetUsage).not.toHaveBeenCalled();
  });

  it("targets ONLY the subscription of the account it was given", async () => {
    mockGetAccount.mockResolvedValue(account(TEAM_ID, "team"));
    mockGetAttachment.mockResolvedValue({
      stripeCustomerId: "cus_team",
      stripeSubscriptionId: TEAM_SUB,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
    });
    mockRequest
      .mockResolvedValueOnce(stripeSub({ id: TEAM_SUB }))
      .mockResolvedValueOnce(stripeSub({ id: TEAM_SUB, cancel_at_period_end: true }));

    await scheduleSubscriptionCancellation(TEAM_ID);

    expect(mockGetAttachment).toHaveBeenCalledWith(TEAM_ID);
    for (const [call] of mockRequest.mock.calls) {
      expect(call.path).toContain(TEAM_SUB);
      expect(call.path).not.toContain(PERSONAL_SUB);
    }
  });

  it("refuses on a FROZEN account (interactive plan changes are unavailable)", async () => {
    mockGetAccount.mockResolvedValue(account(PERSONAL_ID, "personal", "pending_deletion"));
    expect(await scheduleSubscriptionCancellation(PERSONAL_ID)).toEqual({
      ok: false,
      reason: "account_frozen",
    });
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it("reports no_subscription without calling Stripe", async () => {
    mockGetAttachment.mockResolvedValue({
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
    });
    expect(await scheduleSubscriptionCancellation(PERSONAL_ID)).toEqual({
      ok: false,
      reason: "no_subscription",
    });
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it("reports internal_account without calling Stripe", async () => {
    mockGetBillingMode.mockResolvedValue("internal_free");
    expect(await scheduleSubscriptionCancellation(PERSONAL_ID)).toEqual({
      ok: false,
      reason: "internal_account",
    });
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it("reports subscription_already_ended for a canceled sub — not a fake error", async () => {
    mockRequest.mockResolvedValueOnce(stripeSub({ status: "canceled" }));
    expect(await scheduleSubscriptionCancellation(PERSONAL_ID)).toEqual({
      ok: false,
      reason: "subscription_already_ended",
    });
  });

  it("reports subscription_already_ended when Stripe no longer has the subscription", async () => {
    mockRequest.mockRejectedValueOnce(
      new PlatformStripeApiError("No such subscription", 404, "resource_missing"),
    );
    expect(await scheduleSubscriptionCancellation(PERSONAL_ID)).toEqual({
      ok: false,
      reason: "subscription_already_ended",
    });
  });

  it("can cancel a TRIALING subscription", async () => {
    mockRequest
      .mockResolvedValueOnce(stripeSub({ status: "trialing" }))
      .mockResolvedValueOnce(stripeSub({ status: "trialing", cancel_at_period_end: true }));
    const r = await scheduleSubscriptionCancellation(PERSONAL_ID);
    expect(r.ok).toBe(true);
  });

  it("reports stripe_not_configured instead of throwing", async () => {
    mockGetClient.mockImplementation(() => {
      throw new PlatformStripeConfigError("STRIPE_SECRET_KEY is not set");
    });
    expect(await scheduleSubscriptionCancellation(PERSONAL_ID)).toEqual({
      ok: false,
      reason: "stripe_not_configured",
    });
  });

  it("propagates an unexpected Stripe failure to the caller (honest local state)", async () => {
    mockRequest.mockRejectedValueOnce(
      new PlatformStripeApiError("Stripe is down", 500, null),
    );
    await expect(scheduleSubscriptionCancellation(PERSONAL_ID)).rejects.toThrow(
      /Stripe is down/,
    );
  });
});

// ─── Resume ("Keep plan") ────────────────────────────────────────────────────

describe("resumeSubscription", () => {
  it("clears cancel_at_period_end", async () => {
    mockRequest
      .mockResolvedValueOnce(stripeSub({ cancel_at_period_end: true }))
      .mockResolvedValueOnce(stripeSub({ cancel_at_period_end: false }));

    const result = await resumeSubscription(PERSONAL_ID);
    expect(result).toMatchObject({ ok: true, cancelAtPeriodEnd: false, effectiveAt: null });
    expect(mockRequest.mock.calls[1][0]).toMatchObject({
      method: "POST",
      body: { cancel_at_period_end: false },
    });
  });

  it("is idempotent — resuming a non-canceling subscription performs no write", async () => {
    mockRequest.mockResolvedValue(stripeSub({ cancel_at_period_end: false }));
    const result = await resumeSubscription(PERSONAL_ID);
    expect(result).toMatchObject({ ok: true, alreadyInState: true });
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  it("cannot resume a subscription that already ended", async () => {
    mockRequest.mockResolvedValueOnce(stripeSub({ status: "canceled" }));
    expect(await resumeSubscription(PERSONAL_ID)).toEqual({
      ok: false,
      reason: "subscription_already_ended",
    });
  });
});

// ─── Immediate cancellation for account deletion ─────────────────────────────

describe("cancelSubscriptionForAccountDeletion", () => {
  it("cancels immediately, stamps the reason, and works on a FROZEN account", async () => {
    mockGetAccount.mockResolvedValue(account(PERSONAL_ID, "personal", "pending_deletion"));
    mockRequest
      .mockResolvedValueOnce(stripeSub()) // GET
      .mockResolvedValueOnce(stripeSub()) // POST metadata
      .mockResolvedValueOnce(stripeSub({ status: "canceled" })); // DELETE

    const result = await cancelSubscriptionForAccountDeletion(PERSONAL_ID);
    expect(result).toEqual({ ok: true, outcome: "canceled" });

    const [, metadataCall, deleteCall] = mockRequest.mock.calls;
    expect(metadataCall[0]).toMatchObject({
      method: "POST",
      body: { metadata: { [CANCELED_BY_METADATA_KEY]: CANCELED_BY_ACCOUNT_DELETION } },
    });
    expect(deleteCall[0]).toMatchObject({
      method: "DELETE",
      path: `/v1/subscriptions/${PERSONAL_SUB}`,
    });
    // Idempotency key so a retried deletion request is a true no-op inside Stripe's window.
    expect(deleteCall[0].idempotencyKey).toContain(PERSONAL_ID);
  });

  it("does NOT request proration or a refund", async () => {
    mockRequest
      .mockResolvedValueOnce(stripeSub())
      .mockResolvedValueOnce(stripeSub())
      .mockResolvedValueOnce(stripeSub({ status: "canceled" }));
    await cancelSubscriptionForAccountDeletion(PERSONAL_ID);
    const deleteCall = mockRequest.mock.calls[2][0];
    expect(JSON.stringify(deleteCall.body ?? {})).not.toMatch(/prorat|refund/i);
  });

  it("is not_applicable for a FREE account — no Stripe call at all", async () => {
    mockGetAttachment.mockResolvedValue({
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
    });
    expect(await cancelSubscriptionForAccountDeletion(PERSONAL_ID)).toEqual({
      ok: true,
      outcome: "not_applicable",
    });
    expect(mockRequest).not.toHaveBeenCalled();
    expect(mockGetClient).not.toHaveBeenCalled();
  });

  it("is not_applicable for an internal-billing account", async () => {
    mockGetBillingMode.mockResolvedValue("internal_free");
    expect(await cancelSubscriptionForAccountDeletion(PERSONAL_ID)).toEqual({
      ok: true,
      outcome: "not_applicable",
    });
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it("is idempotent — an already-ended subscription is not_applicable, not an error", async () => {
    mockRequest.mockResolvedValueOnce(stripeSub({ status: "canceled" }));
    expect(await cancelSubscriptionForAccountDeletion(PERSONAL_ID)).toEqual({
      ok: true,
      outcome: "not_applicable",
    });
    // No metadata write, no DELETE.
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  it("is idempotent — a subscription Stripe no longer has is not_applicable", async () => {
    mockRequest.mockRejectedValueOnce(
      new PlatformStripeApiError("No such subscription", 404, "resource_missing"),
    );
    expect(await cancelSubscriptionForAccountDeletion(PERSONAL_ID)).toEqual({
      ok: true,
      outcome: "not_applicable",
    });
  });

  it("FAILS honestly when Stripe refuses — never a fake success", async () => {
    mockRequest
      .mockResolvedValueOnce(stripeSub())
      .mockRejectedValueOnce(
        new PlatformStripeApiError(`Stripe error for ${SECRET_LOOKING}`, 500, "api_error"),
      );
    const result = await cancelSubscriptionForAccountDeletion(PERSONAL_ID);
    expect(result).toEqual({ ok: false, reason: "stripe_unavailable" });
    // The reason is a stable machine token — no Stripe message/id/secret rides along.
    expect(JSON.stringify(result)).not.toContain(SECRET_LOOKING);
    expect(JSON.stringify(result)).not.toContain(PERSONAL_SUB);
  });

  it("FAILS honestly when Stripe is not configured", async () => {
    mockGetClient.mockImplementation(() => {
      throw new PlatformStripeConfigError("STRIPE_SECRET_KEY is not set");
    });
    expect(await cancelSubscriptionForAccountDeletion(PERSONAL_ID)).toEqual({
      ok: false,
      reason: "stripe_not_configured",
    });
  });

  it("FAILS honestly when the billing read itself throws (never 'nothing to cancel')", async () => {
    mockGetAttachment.mockRejectedValue(new Error("db down"));
    expect(await cancelSubscriptionForAccountDeletion(PERSONAL_ID)).toEqual({
      ok: false,
      reason: "stripe_unavailable",
    });
  });
});

// ─── Purge fail-closed check ─────────────────────────────────────────────────

describe("accountHasRenewableSubscription", () => {
  it("false when the account has no subscription", async () => {
    mockGetAttachment.mockResolvedValue({
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
    });
    expect(await accountHasRenewableSubscription(PERSONAL_ID)).toEqual({
      ok: true,
      renewable: false,
    });
  });

  it("false when Stripe reports the subscription canceled", async () => {
    mockRequest.mockResolvedValueOnce(stripeSub({ status: "canceled" }));
    expect(await accountHasRenewableSubscription(PERSONAL_ID)).toEqual({
      ok: true,
      renewable: false,
    });
  });

  it("false when Stripe no longer has the subscription", async () => {
    mockRequest.mockRejectedValueOnce(
      new PlatformStripeApiError("No such subscription", 404, "resource_missing"),
    );
    expect(await accountHasRenewableSubscription(PERSONAL_ID)).toEqual({
      ok: true,
      renewable: false,
    });
  });

  it("TRUE for a still-active subscription", async () => {
    mockRequest.mockResolvedValueOnce(stripeSub({ status: "active" }));
    expect(await accountHasRenewableSubscription(PERSONAL_ID)).toEqual({
      ok: true,
      renewable: true,
    });
  });

  it("TRUE for a live subscription that is merely cancel_at_period_end", async () => {
    // Deletion cancels IMMEDIATELY, so anything still live at purge time means the
    // cancellation did not take effect — the purge must not proceed.
    mockRequest.mockResolvedValueOnce(
      stripeSub({ status: "active", cancel_at_period_end: true }),
    );
    expect(await accountHasRenewableSubscription(PERSONAL_ID)).toEqual({
      ok: true,
      renewable: true,
    });
  });

  it("UNVERIFIABLE (not 'safe') when Stripe errors", async () => {
    mockRequest.mockRejectedValueOnce(new PlatformStripeApiError("boom", 500, null));
    expect(await accountHasRenewableSubscription(PERSONAL_ID)).toEqual({
      ok: false,
      reason: "unverifiable",
    });
  });

  it("UNVERIFIABLE when Stripe is not configured but a subscription id exists", async () => {
    mockGetClient.mockImplementation(() => {
      throw new PlatformStripeConfigError("STRIPE_SECRET_KEY is not set");
    });
    expect(await accountHasRenewableSubscription(PERSONAL_ID)).toEqual({
      ok: false,
      reason: "unverifiable",
    });
  });
});
