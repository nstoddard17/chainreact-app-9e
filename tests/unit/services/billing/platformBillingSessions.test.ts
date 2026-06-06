/**
 * @jest-environment node
 *
 * Slice 4.BILLING-PLAN-METADATA-4 / CS-3 — checkout + portal session service.
 *
 * Mocks the account + billing repos and the platform Stripe client; uses the REAL price
 * config (resolvePlanPrice) driven by env, so "server-resolved price" is genuinely
 * exercised. Proves freeze / plan↔type / purchasability / price-config / stripe-config
 * rejection, lazy-vs-existing customer, server price id (never client), portal-needs-
 * customer, and that NEITHER path mutates plan/status (no such write is ever issued).
 */

const mockGetAccount = jest.fn();
jest.mock("@/repositories/accounts", () => ({
  getByIdServiceRole: (...a: unknown[]) => mockGetAccount(...a),
}));

const mockGetAttachment = jest.fn();
const mockAttachCustomer = jest.fn();
const mockUpdateAttachment = jest.fn();
jest.mock("@/repositories/accountBilling", () => ({
  getStripeAttachmentServiceRole: (...a: unknown[]) => mockGetAttachment(...a),
  attachStripeCustomerIfAbsentServiceRole: (...a: unknown[]) => mockAttachCustomer(...a),
  updateStripeAttachmentServiceRole: (...a: unknown[]) => mockUpdateAttachment(...a),
}));

const mockGetClient = jest.fn();
jest.mock("@/services/billing/platformStripeClient", () => ({
  ...jest.requireActual("@/services/billing/platformStripeClient"),
  getPlatformStripeClient: () => mockGetClient(),
}));

import {
  createCheckoutSession,
  createPortalSession,
} from "@/services/billing/platformBillingSessions";
import { PlatformStripeConfigError } from "@/services/billing/platformStripeClient";

const ACCOUNT = "acct-1";

interface StripeCall {
  method: string;
  path: string;
  body?: Record<string, unknown>;
  idempotencyKey?: string;
}

/** A Stripe client mock whose `request` records calls + responds per path. */
function clientReturning(): { request: jest.Mock; calls: StripeCall[] } {
  const calls: StripeCall[] = [];
  const request = jest.fn(async (input: StripeCall) => {
    calls.push(input);
    if (input.path === "/v1/customers") return { id: "cus_new" };
    if (input.path === "/v1/checkout/sessions") return { url: "https://stripe.test/checkout" };
    if (input.path === "/v1/billing_portal/sessions") return { url: "https://stripe.test/portal" };
    throw new Error(`unexpected path ${input.path}`);
  });
  return { request, calls };
}

const origEnv = { ...process.env };
beforeEach(() => {
  mockGetAccount.mockReset();
  mockGetAttachment.mockReset();
  mockAttachCustomer.mockReset();
  mockUpdateAttachment.mockReset();
  mockGetClient.mockReset();
  process.env = { ...origEnv };
  process.env.NEXT_PUBLIC_APP_URL = "https://app.test";
});
afterAll(() => {
  process.env = { ...origEnv };
});

function account(type: string, deletionStatus = "active") {
  return { id: ACCOUNT, type, deletionStatus, name: "X", ownerUserId: "u1" };
}

describe("createCheckoutSession — guards", () => {
  it("account_not_found when the account is missing", async () => {
    mockGetAccount.mockResolvedValueOnce(null);
    const r = await createCheckoutSession({ accountId: ACCOUNT, requestedPlan: "pro" });
    expect(r).toEqual({ ok: false, reason: "account_not_found" });
    expect(mockGetClient).not.toHaveBeenCalled();
  });

  it("account_frozen when pending_deletion", async () => {
    mockGetAccount.mockResolvedValueOnce(account("personal", "pending_deletion"));
    const r = await createCheckoutSession({ accountId: ACCOUNT, requestedPlan: "pro" });
    expect(r).toEqual({ ok: false, reason: "account_frozen" });
  });

  it("invalid_plan_for_type (team plan on a personal account)", async () => {
    mockGetAccount.mockResolvedValueOnce(account("personal"));
    const r = await createCheckoutSession({ accountId: ACCOUNT, requestedPlan: "team" });
    expect(r).toEqual({ ok: false, reason: "invalid_plan_for_type" });
  });

  it("plan_not_purchasable for enterprise (allowed for org, but contact-sales/no price)", async () => {
    mockGetAccount.mockResolvedValueOnce(account("organization"));
    const r = await createCheckoutSession({ accountId: ACCOUNT, requestedPlan: "enterprise" });
    expect(r).toEqual({ ok: false, reason: "plan_not_purchasable" });
    expect(mockGetClient).not.toHaveBeenCalled();
  });

  it("plan_not_purchasable for free (no charge, no price)", async () => {
    mockGetAccount.mockResolvedValueOnce(account("personal"));
    const r = await createCheckoutSession({ accountId: ACCOUNT, requestedPlan: "free" });
    expect(r).toEqual({ ok: false, reason: "plan_not_purchasable" });
  });

  it("price_not_configured when the paid tier's price env var is unset", async () => {
    delete process.env.STRIPE_PRICE_PRO;
    mockGetAccount.mockResolvedValueOnce(account("personal"));
    const r = await createCheckoutSession({ accountId: ACCOUNT, requestedPlan: "pro" });
    expect(r).toEqual({ ok: false, reason: "price_not_configured" });
    expect(mockGetClient).not.toHaveBeenCalled();
  });

  it("stripe_not_configured when the platform client has no secret key", async () => {
    process.env.STRIPE_PRICE_PRO = "price_pro_1";
    mockGetAccount.mockResolvedValueOnce(account("personal"));
    mockGetClient.mockImplementation(() => {
      throw new PlatformStripeConfigError("STRIPE_SECRET_KEY is not set");
    });
    const r = await createCheckoutSession({ accountId: ACCOUNT, requestedPlan: "pro" });
    expect(r).toEqual({ ok: false, reason: "stripe_not_configured" });
  });
});

describe("createCheckoutSession — happy paths", () => {
  it("creates a customer lazily, stores it, and uses the SERVER-resolved price id", async () => {
    process.env.STRIPE_PRICE_PRO = "price_pro_server";
    mockGetAccount.mockResolvedValueOnce(account("personal"));
    mockGetAttachment.mockResolvedValueOnce(null); // no customer yet
    mockAttachCustomer.mockResolvedValueOnce({ stored: true, customerId: "cus_new" });
    const { request, calls } = clientReturning();
    mockGetClient.mockReturnValueOnce({ apiBase: "x", apiVersion: "v", request });

    const r = await createCheckoutSession({
      accountId: ACCOUNT,
      requestedPlan: "pro",
      contactEmail: "owner@x.test",
    });
    expect(r).toEqual({ ok: true, url: "https://stripe.test/checkout" });

    // customer created with account metadata + safe email, dedup idempotency key.
    const customerCall = calls.find((c) => c.path === "/v1/customers")!;
    expect(customerCall.body).toMatchObject({ metadata: { accountId: ACCOUNT }, email: "owner@x.test" });
    expect(customerCall.idempotencyKey).toBe(`platform-customer:${ACCOUNT}`);
    expect(mockAttachCustomer).toHaveBeenCalledWith(ACCOUNT, "cus_new");

    // checkout uses the env price id — NOT any client input — + correct shape + metadata.
    const checkout = calls.find((c) => c.path === "/v1/checkout/sessions")!;
    expect(checkout.body).toMatchObject({
      mode: "subscription",
      customer: "cus_new",
      line_items: [{ price: "price_pro_server", quantity: 1 }],
      success_url: "https://app.test/account?billing=success",
      cancel_url: "https://app.test/account?billing=canceled",
      metadata: { accountId: ACCOUNT, plan: "pro" },
      subscription_data: { metadata: { accountId: ACCOUNT, plan: "pro" } },
    });
  });

  it("reuses an existing customer (no /v1/customers create)", async () => {
    process.env.STRIPE_PRICE_BUSINESS = "price_biz_1";
    mockGetAccount.mockResolvedValueOnce(account("organization"));
    mockGetAttachment.mockResolvedValueOnce({
      stripeCustomerId: "cus_existing",
      stripeSubscriptionId: null,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
    });
    const { request, calls } = clientReturning();
    mockGetClient.mockReturnValueOnce({ apiBase: "x", apiVersion: "v", request });

    const r = await createCheckoutSession({ accountId: ACCOUNT, requestedPlan: "business" });
    expect(r.ok).toBe(true);
    expect(calls.find((c) => c.path === "/v1/customers")).toBeUndefined();
    expect(mockAttachCustomer).not.toHaveBeenCalled();
    const checkout = calls.find((c) => c.path === "/v1/checkout/sessions")!;
    expect(checkout.body).toMatchObject({ customer: "cus_existing", line_items: [{ price: "price_biz_1", quantity: 1 }] });
  });

  it("never mutates plan/status (no account_billing plan write issued)", async () => {
    process.env.STRIPE_PRICE_PRO = "price_pro_1";
    mockGetAccount.mockResolvedValueOnce(account("personal"));
    mockGetAttachment.mockResolvedValueOnce({
      stripeCustomerId: "cus_x",
      stripeSubscriptionId: null,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
    });
    const { request } = clientReturning();
    mockGetClient.mockReturnValueOnce({ apiBase: "x", apiVersion: "v", request });

    await createCheckoutSession({ accountId: ACCOUNT, requestedPlan: "pro" });
    // The only billing write helper used by checkout is the lazy customer attach (and
    // here it isn't even called since a customer exists). No plan/status update exists.
    expect(mockUpdateAttachment).not.toHaveBeenCalled();
  });
});

describe("createPortalSession", () => {
  it("account_not_found / account_frozen", async () => {
    mockGetAccount.mockResolvedValueOnce(null);
    expect(await createPortalSession({ accountId: ACCOUNT })).toEqual({
      ok: false,
      reason: "account_not_found",
    });
    mockGetAccount.mockResolvedValueOnce(account("personal", "pending_deletion"));
    expect(await createPortalSession({ accountId: ACCOUNT })).toEqual({
      ok: false,
      reason: "account_frozen",
    });
  });

  it("no_customer when the account has no stripe_customer_id", async () => {
    mockGetAccount.mockResolvedValueOnce(account("personal"));
    mockGetAttachment.mockResolvedValueOnce({
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
    });
    const r = await createPortalSession({ accountId: ACCOUNT });
    expect(r).toEqual({ ok: false, reason: "no_customer" });
    expect(mockGetClient).not.toHaveBeenCalled();
  });

  it("stripe_not_configured when the client has no secret", async () => {
    mockGetAccount.mockResolvedValueOnce(account("personal"));
    mockGetAttachment.mockResolvedValueOnce({
      stripeCustomerId: "cus_x",
      stripeSubscriptionId: null,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
    });
    mockGetClient.mockImplementation(() => {
      throw new PlatformStripeConfigError("no key");
    });
    expect(await createPortalSession({ accountId: ACCOUNT })).toEqual({
      ok: false,
      reason: "stripe_not_configured",
    });
  });

  it("returns the portal url for an account with a customer", async () => {
    mockGetAccount.mockResolvedValueOnce(account("personal"));
    mockGetAttachment.mockResolvedValueOnce({
      stripeCustomerId: "cus_x",
      stripeSubscriptionId: "sub_x",
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
    });
    const { request, calls } = clientReturning();
    mockGetClient.mockReturnValueOnce({ apiBase: "x", apiVersion: "v", request });

    const r = await createPortalSession({ accountId: ACCOUNT });
    expect(r).toEqual({ ok: true, url: "https://stripe.test/portal" });
    const portal = calls.find((c) => c.path === "/v1/billing_portal/sessions")!;
    expect(portal.body).toMatchObject({ customer: "cus_x", return_url: "https://app.test/account" });
  });
});
