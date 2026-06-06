/**
 * @jest-environment node
 *
 * Slice 4.BILLING-PLAN-METADATA-5 / CS-4 — applyBillingSubscriptionSyncServiceRole.
 * Mocks the service-role client's update().eq() chain; asserts only provided fields are
 * written (the webhook is the sole plan/status writer) and an empty patch is a no-op.
 */

interface WriteState {
  patch?: Record<string, unknown>;
  eqArg?: unknown;
  error: { message: string } | null;
  called: boolean;
}
const writeState: WriteState = { error: null, called: false };

function makeClient() {
  writeState.called = true;
  return {
    from: jest.fn(() => ({
      update: jest.fn((patch: Record<string, unknown>) => {
        writeState.patch = patch;
        return {
          eq: jest.fn(async (_c: string, v: unknown) => {
            writeState.eqArg = v;
            return { error: writeState.error };
          }),
        };
      }),
    })),
  };
}

const mockGetClient = jest.fn((..._a: unknown[]) => makeClient());
jest.mock("@/repositories/supabase/serviceRoleClient", () => ({
  getServiceRoleClient: (...a: unknown[]) => mockGetClient(...a),
}));

import { applyBillingSubscriptionSyncServiceRole } from "@/repositories/accountBilling";

beforeEach(() => {
  writeState.patch = undefined;
  writeState.eqArg = undefined;
  writeState.error = null;
  writeState.called = false;
  mockGetClient.mockClear();
});

it("writes only the provided fields (snake_cased) keyed on account_id", async () => {
  await applyBillingSubscriptionSyncServiceRole("acct-1", {
    plan: "pro",
    planStatus: "active",
    currentPeriodEnd: "2026-08-01T00:00:00.000Z",
    cancelAtPeriodEnd: false,
    stripeCustomerId: "cus_1",
    stripeSubscriptionId: "sub_1",
  });
  expect(writeState.patch).toEqual({
    plan: "pro",
    plan_status: "active",
    current_period_end: "2026-08-01T00:00:00.000Z",
    cancel_at_period_end: false,
    stripe_customer_id: "cus_1",
    stripe_subscription_id: "sub_1",
  });
  expect(writeState.eqArg).toBe("acct-1");
});

it("writes a partial patch (e.g. status only) without disturbing other columns", async () => {
  await applyBillingSubscriptionSyncServiceRole("acct-1", { planStatus: "canceled" });
  expect(writeState.patch).toEqual({ plan_status: "canceled" });
});

it("maps explicit null to a column clear", async () => {
  await applyBillingSubscriptionSyncServiceRole("acct-1", { stripeSubscriptionId: null });
  expect(writeState.patch).toEqual({ stripe_subscription_id: null });
});

it("is a no-op (no client) on an empty patch", async () => {
  await applyBillingSubscriptionSyncServiceRole("acct-1", {});
  expect(mockGetClient).not.toHaveBeenCalled();
  expect(writeState.called).toBe(false);
});

it("throws a generic repository error on a DB error", async () => {
  writeState.error = { message: "boom" };
  await expect(
    applyBillingSubscriptionSyncServiceRole("acct-1", { planStatus: "active" }),
  ).rejects.toThrow(/applyBillingSubscriptionSyncServiceRole failed/);
});
