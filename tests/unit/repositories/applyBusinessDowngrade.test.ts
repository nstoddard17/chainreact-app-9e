/**
 * @jest-environment node
 *
 * Slice 4.PLATFORM-BILLING-BUSINESS-DOWNGRADE-2 / CS-BD-1 — applyBusinessDowngradeServiceRole
 * wrapper. Mocks the service-role client's rpc(); asserts arg mapping (incl. the policy-defaulted
 * Team tasks_limit), result mapping (already_team / not_downgradeable / frozen / not_found), and
 * generic error handling.
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

import { applyBusinessDowngradeServiceRole } from "@/repositories/accountBilling";
import { planLimitsFor } from "@/core/billing/planPolicy";

beforeEach(() => {
  rpcState.name = undefined;
  rpcState.args = undefined;
  rpcState.data = { ok: true, applied: true, reason: "downgraded" };
  rpcState.error = null;
});

it("calls apply_business_downgrade with mapped args + the Team policy tasks_limit", async () => {
  const r = await applyBusinessDowngradeServiceRole({ accountId: "acct-1", planStatus: "active" });
  expect(r).toEqual({ ok: true, applied: true, reason: "downgraded" });
  expect(rpcState.name).toBe("apply_business_downgrade");
  expect(rpcState.args).toEqual({
    p_account_id: "acct-1",
    p_plan_status: "active",
    p_tasks_limit: planLimitsFor("team").taskLimit,
    p_ai_credits_limit: planLimitsFor("team").aiCreditsMonthlyLimit,
  });
});

it("honors an explicit tasksLimit/aiCreditsLimit", async () => {
  await applyBusinessDowngradeServiceRole({
    accountId: "acct-2",
    planStatus: "canceled",
    tasksLimit: 42,
    aiCreditsLimit: 84,
  });
  expect(rpcState.args).toMatchObject({
    p_plan_status: "canceled",
    p_tasks_limit: 42,
    p_ai_credits_limit: 84,
  });
});

it("maps an idempotent no-op (already_team) through unchanged", async () => {
  rpcState.data = { ok: true, applied: false, reason: "already_team" };
  const r = await applyBusinessDowngradeServiceRole({ accountId: "acct-3", planStatus: "active" });
  expect(r).toEqual({ ok: true, applied: false, reason: "already_team" });
});

it.each(["not_downgradeable", "account_frozen", "account_not_found"])(
  "maps the safe rejection reason %s through unchanged",
  async (reason) => {
    rpcState.data = { ok: false, applied: false, reason };
    const r = await applyBusinessDowngradeServiceRole({ accountId: "acct-4", planStatus: "active" });
    expect(r).toEqual({ ok: false, applied: false, reason });
  },
);

it("throws a generic error on an RPC error", async () => {
  rpcState.error = { message: "boom" };
  await expect(
    applyBusinessDowngradeServiceRole({ accountId: "acct-5", planStatus: "active" }),
  ).rejects.toThrow(/apply_business_downgrade RPC failed/);
});
