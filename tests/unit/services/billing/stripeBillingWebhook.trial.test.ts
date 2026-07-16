/**
 * @jest-environment node
 *
 * PRO-TEAM-TRIAL-ENFORCEMENT-1 — webhook trial-window sync.
 *
 * Proves the webhook only MIRRORS Stripe's trial window and can NEVER grant/restore/advance
 * eligibility:
 *   - customer.subscription.updated with trial_start/trial_end → syncTrialWindowServiceRole is
 *     called with those ISO values, and NO trial_consumed_at / origin write ever happens;
 *   - a subscription with no trial fields → no window write;
 *   - subscription.deleted → no window write (and consumed is never touched);
 *   - checkout.session.completed → no window write (trial fields live on the subscription);
 *   - a duplicate/replayed event → deduped, exactly one window write total.
 */

import { createHmac } from "node:crypto";

const mockHasProcessed = jest.fn();
const mockRecordProcessed = jest.fn();
jest.mock("@/repositories/stripeBillingEvents", () => ({
  hasProcessed: (...a: unknown[]) => mockHasProcessed(...a),
  recordProcessed: (...a: unknown[]) => mockRecordProcessed(...a),
}));

const mockApplySync = jest.fn();
const mockApplyUpgrade = jest.fn();
const mockSyncTrialWindow = jest.fn();
jest.mock("@/repositories/accountBilling", () => ({
  applyBillingSubscriptionSyncServiceRole: (...a: unknown[]) => mockApplySync(...a),
  applyBusinessUpgradeServiceRole: (...a: unknown[]) => mockApplyUpgrade(...a),
  syncTrialWindowServiceRole: (...a: unknown[]) => mockSyncTrialWindow(...a),
}));

const mockGetAccount = jest.fn();
jest.mock("@/repositories/accounts", () => ({
  getByIdServiceRole: (...a: unknown[]) => mockGetAccount(...a),
}));

import {
  handleStripeBillingWebhook,
  STRIPE_BILLING_WEBHOOK_SECRET_ENV,
} from "@/services/billing/stripeBillingWebhook";

const SECRET = "whsec_platform_test";
const NOW = 1_700_000_000;
const TRIAL_START = 1_700_100_000;
const TRIAL_END = 1_701_400_000;
const ISO = (sec: number) => new Date(sec * 1000).toISOString();

function sign(body: string, t = NOW): string {
  const v1 = createHmac("sha256", SECRET).update(`${t}.${body}`, "utf8").digest("hex");
  return `t=${t},v1=${v1}`;
}
function event(type: string, object: Record<string, unknown>, id = "evt_1"): string {
  return JSON.stringify({ id, type, data: { object } });
}
function personal() {
  return { id: "acct-1", type: "personal", deletionStatus: "active", name: "X", ownerUserId: "u1" };
}

const origEnv = { ...process.env };
beforeEach(() => {
  mockHasProcessed.mockReset().mockResolvedValue(false);
  mockRecordProcessed.mockReset().mockResolvedValue(undefined);
  mockApplySync.mockReset().mockResolvedValue(undefined);
  mockApplyUpgrade.mockReset().mockResolvedValue({ ok: true, applied: true, reason: "upgraded" });
  mockSyncTrialWindow.mockReset().mockResolvedValue(undefined);
  mockGetAccount.mockReset().mockResolvedValue(personal());
  process.env = { ...origEnv };
  process.env[STRIPE_BILLING_WEBHOOK_SECRET_ENV] = SECRET;
});
afterAll(() => {
  process.env = { ...origEnv };
});

it("mirrors Stripe's trial window on subscription.updated — never writes the consumed marker", async () => {
  const body = event("customer.subscription.updated", {
    id: "sub_1",
    customer: "cus_1",
    status: "trialing",
    trial_start: TRIAL_START,
    trial_end: TRIAL_END,
    metadata: { accountId: "acct-1", plan: "pro" },
  });
  const r = await handleStripeBillingWebhook(body, sign(body), { nowSeconds: NOW });
  expect(r).toMatchObject({ ok: true, outcome: "processed" });

  expect(mockSyncTrialWindow).toHaveBeenCalledWith("acct-1", {
    trialStartedAt: ISO(TRIAL_START),
    trialEndsAt: ISO(TRIAL_END),
  });
  // The plan/status sync patch NEVER carries a consumed/origin key — those are claim-only.
  const syncFields = mockApplySync.mock.calls[0]![1] as Record<string, unknown>;
  expect(syncFields).not.toHaveProperty("trialConsumedAt");
  expect(syncFields).not.toHaveProperty("trialOriginPlan");
});

it("a subscription with NO trial fields performs no window write", async () => {
  const body = event("customer.subscription.updated", {
    id: "sub_1",
    customer: "cus_1",
    status: "active",
    metadata: { accountId: "acct-1", plan: "pro" },
  });
  await handleStripeBillingWebhook(body, sign(body), { nowSeconds: NOW });
  expect(mockSyncTrialWindow).not.toHaveBeenCalled();
});

it("subscription.deleted does not touch the trial window (or the consumed marker)", async () => {
  const body = event("customer.subscription.deleted", {
    id: "sub_1",
    customer: "cus_1",
    status: "canceled",
    metadata: { accountId: "acct-1", plan: "pro" },
  });
  const r = await handleStripeBillingWebhook(body, sign(body), { nowSeconds: NOW });
  expect(r).toMatchObject({ ok: true, outcome: "processed" });
  expect(mockSyncTrialWindow).not.toHaveBeenCalled();
});

it("checkout.session.completed performs no window write (trial fields are on the subscription)", async () => {
  const body = event("checkout.session.completed", {
    customer: "cus_1",
    subscription: "sub_1",
    metadata: { accountId: "acct-1", plan: "pro" },
  });
  await handleStripeBillingWebhook(body, sign(body), { nowSeconds: NOW });
  expect(mockSyncTrialWindow).not.toHaveBeenCalled();
});

it("a replayed event is deduped — exactly one window write total", async () => {
  const body = event("customer.subscription.updated", {
    id: "sub_1",
    customer: "cus_1",
    status: "trialing",
    trial_start: TRIAL_START,
    trial_end: TRIAL_END,
    metadata: { accountId: "acct-1", plan: "pro" },
  });
  await handleStripeBillingWebhook(body, sign(body), { nowSeconds: NOW });
  mockHasProcessed.mockResolvedValueOnce(true); // second delivery already recorded
  const r2 = await handleStripeBillingWebhook(body, sign(body), { nowSeconds: NOW });
  expect(r2).toMatchObject({ ok: true, outcome: "deduped" });
  expect(mockSyncTrialWindow).toHaveBeenCalledTimes(1);
});
