/**
 * @jest-environment node
 *
 * Slice 4.BILLING-PLAN-METADATA-5 / CS-4 — platform billing webhook handler.
 *
 * Uses the REAL signature verifier with a real HMAC so signature behavior is genuinely
 * exercised. Mocks the dedup ledger, the billing-sync writer, and the account read.
 * Proves: fail-closed on missing secret, invalid/expired signature, dedup, the four
 * lifecycle events, metadata/account validation (never write an unsafe plan), and that
 * the event is recorded only AFTER a successful sync.
 */

import { createHmac } from "node:crypto";

const mockHasProcessed = jest.fn();
const mockRecordProcessed = jest.fn();
jest.mock("@/repositories/stripeBillingEvents", () => ({
  hasProcessed: (...a: unknown[]) => mockHasProcessed(...a),
  recordProcessed: (...a: unknown[]) => mockRecordProcessed(...a),
}));

const mockApplySync = jest.fn();
jest.mock("@/repositories/accountBilling", () => ({
  applyBillingSubscriptionSyncServiceRole: (...a: unknown[]) => mockApplySync(...a),
}));

const mockGetAccount = jest.fn();
jest.mock("@/repositories/accounts", () => ({
  getByIdServiceRole: (...a: unknown[]) => mockGetAccount(...a),
}));

import {
  handleStripeBillingWebhook,
  mapStripeSubscriptionStatus,
  STRIPE_BILLING_WEBHOOK_SECRET_ENV,
} from "@/services/billing/stripeBillingWebhook";

const SECRET = "whsec_platform_test";
const NOW = 1_700_000_000;

function sign(body: string, secret = SECRET, t = NOW): string {
  const v1 = createHmac("sha256", secret).update(`${t}.${body}`, "utf8").digest("hex");
  return `t=${t},v1=${v1}`;
}

function event(type: string, object: Record<string, unknown>, id = "evt_1"): string {
  return JSON.stringify({ id, type, data: { object } });
}

const origEnv = { ...process.env };
beforeEach(() => {
  mockHasProcessed.mockReset().mockResolvedValue(false);
  mockRecordProcessed.mockReset().mockResolvedValue(undefined);
  mockApplySync.mockReset().mockResolvedValue(undefined);
  mockGetAccount.mockReset();
  process.env = { ...origEnv };
  process.env[STRIPE_BILLING_WEBHOOK_SECRET_ENV] = SECRET;
});
afterAll(() => {
  process.env = { ...origEnv };
});

describe("mapStripeSubscriptionStatus", () => {
  it("maps Stripe statuses to PlanStatus (or null)", () => {
    expect(mapStripeSubscriptionStatus("active")).toBe("active");
    expect(mapStripeSubscriptionStatus("trialing")).toBe("trialing");
    expect(mapStripeSubscriptionStatus("past_due")).toBe("past_due");
    expect(mapStripeSubscriptionStatus("unpaid")).toBe("past_due");
    expect(mapStripeSubscriptionStatus("canceled")).toBe("canceled");
    expect(mapStripeSubscriptionStatus("incomplete")).toBe("incomplete");
    expect(mapStripeSubscriptionStatus("incomplete_expired")).toBe("canceled");
    expect(mapStripeSubscriptionStatus("something_new")).toBeNull();
    expect(mapStripeSubscriptionStatus(null)).toBeNull();
  });
});

describe("signature / fail-closed", () => {
  it("fails closed (not_configured) when the secret is missing — no verify, no work", async () => {
    delete process.env[STRIPE_BILLING_WEBHOOK_SECRET_ENV];
    const body = event("customer.subscription.updated", {});
    const r = await handleStripeBillingWebhook(body, sign(body), { nowSeconds: NOW });
    expect(r).toEqual({ ok: false, reason: "not_configured" });
    expect(mockHasProcessed).not.toHaveBeenCalled();
    expect(mockApplySync).not.toHaveBeenCalled();
  });

  it("invalid_signature when the header is absent", async () => {
    const body = event("customer.subscription.updated", {});
    const r = await handleStripeBillingWebhook(body, null, { nowSeconds: NOW });
    expect(r).toEqual({ ok: false, reason: "invalid_signature" });
    expect(mockApplySync).not.toHaveBeenCalled();
  });

  it("invalid_signature when the HMAC does not match (no processing before verify)", async () => {
    const body = event("customer.subscription.updated", {});
    const r = await handleStripeBillingWebhook(body, sign(body, "wrong_secret"), { nowSeconds: NOW });
    expect(r).toEqual({ ok: false, reason: "invalid_signature" });
    expect(mockHasProcessed).not.toHaveBeenCalled();
  });

  it("invalid_signature when the timestamp is outside the replay tolerance (expired)", async () => {
    const body = event("customer.subscription.updated", {});
    // Signed at NOW, but "now" is 10 minutes later → outside the 300s window.
    const r = await handleStripeBillingWebhook(body, sign(body), { nowSeconds: NOW + 600 });
    expect(r).toEqual({ ok: false, reason: "invalid_signature" });
  });

  it("bad_request on a verified-but-unparseable body", async () => {
    const body = "not json{";
    const r = await handleStripeBillingWebhook(body, sign(body), { nowSeconds: NOW });
    expect(r).toEqual({ ok: false, reason: "bad_request" });
  });

  it("bad_request when the event has no id/type", async () => {
    const body = JSON.stringify({ data: { object: {} } });
    const r = await handleStripeBillingWebhook(body, sign(body), { nowSeconds: NOW });
    expect(r).toEqual({ ok: false, reason: "bad_request" });
  });
});

describe("dedup", () => {
  it("does not process an already-seen event id", async () => {
    mockHasProcessed.mockResolvedValueOnce(true);
    const body = event("customer.subscription.updated", { metadata: { accountId: "a1" } });
    const r = await handleStripeBillingWebhook(body, sign(body), { nowSeconds: NOW });
    expect(r).toEqual({ ok: true, outcome: "deduped", eventType: "customer.subscription.updated" });
    expect(mockApplySync).not.toHaveBeenCalled();
    expect(mockRecordProcessed).not.toHaveBeenCalled();
  });
});

describe("event processing", () => {
  it("checkout.session.completed stores customer/subscription/plan + active", async () => {
    mockGetAccount.mockResolvedValueOnce({ id: "a1", type: "personal", deletionStatus: "active" });
    const obj = {
      customer: "cus_1",
      subscription: "sub_1",
      metadata: { accountId: "a1", plan: "pro" },
    };
    const body = event("checkout.session.completed", obj);
    const r = await handleStripeBillingWebhook(body, sign(body), { nowSeconds: NOW });
    expect(r).toEqual({ ok: true, outcome: "processed", eventType: "checkout.session.completed" });
    expect(mockApplySync).toHaveBeenCalledWith("a1", {
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
      planStatus: "active",
      plan: "pro",
    });
    expect(mockRecordProcessed).toHaveBeenCalledWith({
      eventId: "evt_1",
      eventType: "checkout.session.completed",
      accountId: "a1",
    });
  });

  it("customer.subscription.updated syncs status/period/cancel/plan", async () => {
    mockGetAccount.mockResolvedValueOnce({ id: "a1", type: "organization", deletionStatus: "active" });
    const obj = {
      id: "sub_2",
      customer: "cus_2",
      status: "active",
      cancel_at_period_end: true,
      current_period_end: 1_701_000_000,
      metadata: { accountId: "a1", plan: "business" },
    };
    const body = event("customer.subscription.updated", obj);
    const r = await handleStripeBillingWebhook(body, sign(body), { nowSeconds: NOW });
    expect(r.ok && r.outcome).toBe("processed");
    expect(mockApplySync).toHaveBeenCalledWith("a1", {
      stripeSubscriptionId: "sub_2",
      stripeCustomerId: "cus_2",
      cancelAtPeriodEnd: true,
      currentPeriodEnd: new Date(1_701_000_000 * 1000).toISOString(),
      planStatus: "active",
      plan: "business",
    });
  });

  it("customer.subscription.deleted reverts a PERSONAL account to free (D2)", async () => {
    mockGetAccount.mockResolvedValueOnce({ id: "a1", type: "personal", deletionStatus: "active" });
    const obj = { id: "sub_3", customer: "cus_3", metadata: { accountId: "a1", plan: "pro" } };
    const body = event("customer.subscription.deleted", obj);
    const r = await handleStripeBillingWebhook(body, sign(body), { nowSeconds: NOW });
    expect(r.ok && r.outcome).toBe("processed");
    const [, fields] = mockApplySync.mock.calls[0]!;
    expect(fields.planStatus).toBe("canceled");
    expect(fields.plan).toBe("free");
    expect(fields.tasksLimit).toBe(100); // Free policy task cap
  });

  it("customer.subscription.deleted LEAVES a team/org plan (CS-4 behavior unchanged)", async () => {
    mockGetAccount.mockResolvedValueOnce({ id: "a1", type: "team", deletionStatus: "active" });
    const obj = { id: "sub_3", customer: "cus_3", metadata: { accountId: "a1", plan: "team" } };
    const body = event("customer.subscription.deleted", obj);
    const r = await handleStripeBillingWebhook(body, sign(body), { nowSeconds: NOW });
    expect(r.ok && r.outcome).toBe("processed");
    const [, fields] = mockApplySync.mock.calls[0]!;
    expect(fields.planStatus).toBe("canceled");
    expect(fields).not.toHaveProperty("plan"); // team/org revert is not planned in PPT-1
    expect(fields).not.toHaveProperty("tasksLimit");
  });

  it("personal subscription.deleted is idempotent (dedup short-circuits a replay)", async () => {
    mockHasProcessed.mockResolvedValueOnce(true);
    const obj = { id: "sub_3", metadata: { accountId: "a1", plan: "pro" } };
    const body = event("customer.subscription.deleted", obj);
    const r = await handleStripeBillingWebhook(body, sign(body), { nowSeconds: NOW });
    expect(r).toEqual({ ok: true, outcome: "deduped", eventType: "customer.subscription.deleted" });
    expect(mockApplySync).not.toHaveBeenCalled();
  });

  it("records AFTER a successful sync (order)", async () => {
    mockGetAccount.mockResolvedValueOnce({ id: "a1", type: "personal", deletionStatus: "active" });
    const obj = { id: "sub_4", metadata: { accountId: "a1" } };
    const body = event("customer.subscription.updated", obj);
    await handleStripeBillingWebhook(body, sign(body), { nowSeconds: NOW });
    const syncOrder = mockApplySync.mock.invocationCallOrder[0]!;
    const recordOrder = mockRecordProcessed.mock.invocationCallOrder[0]!;
    expect(syncOrder).toBeLessThan(recordOrder);
  });
});

describe("metadata / account safety (never write an unsafe plan)", () => {
  it("ignores an event with no accountId metadata (no sync, records with null account)", async () => {
    const body = event("customer.subscription.updated", { id: "sub_x", status: "active" });
    const r = await handleStripeBillingWebhook(body, sign(body), { nowSeconds: NOW });
    expect(r).toEqual({ ok: true, outcome: "ignored", eventType: "customer.subscription.updated" });
    expect(mockApplySync).not.toHaveBeenCalled();
    expect(mockRecordProcessed).toHaveBeenCalledWith({
      eventId: "evt_1",
      eventType: "customer.subscription.updated",
      accountId: null,
    });
  });

  it("ignores an event for an unknown account (account read returns null)", async () => {
    mockGetAccount.mockResolvedValueOnce(null);
    const body = event("customer.subscription.updated", { metadata: { accountId: "ghost" } });
    const r = await handleStripeBillingWebhook(body, sign(body), { nowSeconds: NOW });
    expect(r.ok && r.outcome).toBe("ignored");
    expect(mockApplySync).not.toHaveBeenCalled();
    expect(mockRecordProcessed).toHaveBeenCalledWith({
      eventId: "evt_1",
      eventType: "customer.subscription.updated",
      accountId: "ghost",
    });
  });

  it("drops an invalid plan from metadata but still syncs the safe fields", async () => {
    mockGetAccount.mockResolvedValueOnce({ id: "a1", type: "personal", deletionStatus: "active" });
    const body = event("customer.subscription.updated", {
      id: "sub_5",
      status: "active",
      metadata: { accountId: "a1", plan: "gold" },
    });
    await handleStripeBillingWebhook(body, sign(body), { nowSeconds: NOW });
    const [, fields] = mockApplySync.mock.calls[0]!;
    expect(fields).not.toHaveProperty("plan");
    expect(fields.planStatus).toBe("active");
  });

  it("drops a plan not allowed for the account type", async () => {
    mockGetAccount.mockResolvedValueOnce({ id: "a1", type: "personal", deletionStatus: "active" });
    const body = event("customer.subscription.updated", {
      id: "sub_6",
      status: "active",
      metadata: { accountId: "a1", plan: "team" }, // team plan invalid for a personal account
    });
    await handleStripeBillingWebhook(body, sign(body), { nowSeconds: NOW });
    const [, fields] = mockApplySync.mock.calls[0]!;
    expect(fields).not.toHaveProperty("plan");
  });

  it("ignores an unhandled event type (records, no sync)", async () => {
    const body = event("invoice.payment_succeeded", { metadata: { accountId: "a1" } });
    const r = await handleStripeBillingWebhook(body, sign(body), { nowSeconds: NOW });
    expect(r.ok && r.outcome).toBe("ignored");
    expect(mockGetAccount).not.toHaveBeenCalled();
    expect(mockApplySync).not.toHaveBeenCalled();
  });
});
