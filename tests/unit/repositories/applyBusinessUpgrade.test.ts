/**
 * @jest-environment node
 *
 * Slice 4.BILLING-BUSINESS-UPGRADE-2 / BU-1 — applyBusinessUpgradeServiceRole wrapper.
 * Mocks the service-role client's rpc(); asserts arg mapping (incl. the policy-defaulted
 * tasks_limit), result mapping, and generic error handling.
 */

interface RpcState {
  name?: string;
  args?: Record<string, unknown>;
  data: unknown;
  error: { message: string } | null;
}
const rpcState: RpcState = { data: null, error: null };

function makeClient() {
  return {
    rpc: jest.fn(async (name: string, args: Record<string, unknown>) => {
      rpcState.name = name;
      rpcState.args = args;
      return { data: rpcState.data, error: rpcState.error };
    }),
  };
}

jest.mock("@/repositories/supabase/serviceRoleClient", () => ({
  getServiceRoleClient: jest.fn(() => makeClient()),
}));

import { applyBusinessUpgradeServiceRole } from "@/repositories/accountBilling";
import { planLimitsFor } from "@/core/billing/planPolicy";

beforeEach(() => {
  rpcState.name = undefined;
  rpcState.args = undefined;
  rpcState.data = { ok: true, applied: true, reason: "upgraded" };
  rpcState.error = null;
});

it("calls apply_business_upgrade with mapped args + the Business policy tasks_limit", async () => {
  const r = await applyBusinessUpgradeServiceRole({
    accountId: "acct-1",
    planStatus: "active",
    currentPeriodEnd: "2026-08-01T00:00:00Z",
    cancelAtPeriodEnd: false,
    stripeSubscriptionId: "sub_1",
    stripeCustomerId: "cus_1",
  });
  expect(r).toEqual({ ok: true, applied: true, reason: "upgraded" });
  expect(rpcState.name).toBe("apply_business_upgrade");
  expect(rpcState.args).toEqual({
    p_account_id: "acct-1",
    p_plan_status: "active",
    p_current_period_end: "2026-08-01T00:00:00Z",
    p_cancel_at_period_end: false,
    p_stripe_subscription_id: "sub_1",
    p_stripe_customer_id: "cus_1",
    p_tasks_limit: planLimitsFor("business").taskLimit,
  });
});

it("defaults the optional fields (null ids, false cancel) and honors an explicit tasksLimit", async () => {
  await applyBusinessUpgradeServiceRole({ accountId: "acct-2", planStatus: "trialing", tasksLimit: 999 });
  expect(rpcState.args).toMatchObject({
    p_stripe_subscription_id: null,
    p_stripe_customer_id: null,
    p_cancel_at_period_end: false,
    p_current_period_end: null,
    p_tasks_limit: 999,
  });
});

it("maps an idempotent no-op result through unchanged", async () => {
  rpcState.data = { ok: true, applied: false, reason: "already_upgraded" };
  const r = await applyBusinessUpgradeServiceRole({ accountId: "acct-3", planStatus: "active" });
  expect(r).toEqual({ ok: true, applied: false, reason: "already_upgraded" });
});

it("throws a generic error on an RPC error", async () => {
  rpcState.error = { message: "boom" };
  await expect(
    applyBusinessUpgradeServiceRole({ accountId: "acct-4", planStatus: "active" }),
  ).rejects.toThrow(/apply_business_upgrade RPC failed/);
});
