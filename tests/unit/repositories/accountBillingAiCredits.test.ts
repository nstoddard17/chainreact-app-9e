/**
 * @jest-environment node
 *
 * Slice 4.AI-CREDITS-3 — repositories/accountBilling AI-credit helpers.
 *
 * Proves: `deductAiCredits` calls the `deduct_ai_credits_if_available` RPC via the
 * SERVICE-ROLE client with the right args + maps the response (throws on RPC error
 * so the gate can fail closed); and `getUsage` selects + maps the AI columns
 * (used/limit/remaining/period) — `remaining = max(0, limit − used)`.
 */

interface RpcState {
  name?: string;
  args?: Record<string, unknown>;
  data: unknown;
  error: { message: string } | null;
}
const rpcState: RpcState = { data: null, error: null };

function makeServiceRoleClient() {
  return {
    rpc: jest.fn(async (name: string, args: Record<string, unknown>) => {
      rpcState.name = name;
      rpcState.args = args;
      return { data: rpcState.data, error: rpcState.error };
    }),
  };
}

interface UsageState {
  row: Record<string, unknown> | null;
  error: { message: string } | null;
  selected?: string;
}
const usageState: UsageState = { row: null, error: null };

function makeSsrClient() {
  return {
    from: jest.fn(() => ({
      select: jest.fn((cols: string) => {
        usageState.selected = cols;
        return {
          eq: jest.fn(() => ({
            maybeSingle: jest.fn(async () => ({ data: usageState.row, error: usageState.error })),
          })),
        };
      }),
    })),
  };
}

jest.mock("@/repositories/supabase/serviceRoleClient", () => ({
  getServiceRoleClient: jest.fn(() => makeServiceRoleClient()),
}));
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => makeSsrClient()),
}));

import { deductAiCredits, getAiCreditUsage } from "@/repositories/accountBillingAiCredits";

beforeEach(() => {
  rpcState.name = undefined;
  rpcState.args = undefined;
  rpcState.data = null;
  rpcState.error = null;
  usageState.row = null;
  usageState.error = null;
  usageState.selected = undefined;
});

describe("deductAiCredits", () => {
  it("calls deduct_ai_credits_if_available with the account + amount, maps ok", async () => {
    rpcState.data = { ok: true, used: 7, limit: 500 };
    const out = await deductAiCredits("acct-1", 4);
    expect(rpcState.name).toBe("deduct_ai_credits_if_available");
    expect(rpcState.args).toEqual({ p_account_id: "acct-1", p_amount: 4 });
    expect(out).toEqual({ ok: true, used: 7, limit: 500 });
  });

  it("maps the refusal response (ok:false) without throwing", async () => {
    rpcState.data = { ok: false, used: 20, limit: 20 };
    expect(await deductAiCredits("acct-1", 5)).toEqual({ ok: false, used: 20, limit: 20 });
  });

  it("throws on an RPC error so the gate can fail closed", async () => {
    rpcState.error = { message: "boom" };
    await expect(deductAiCredits("acct-1", 1)).rejects.toThrow(/deduct_ai_credits_if_available/);
  });

  it("accepts a 0 amount (the RPC treats it as a no-op)", async () => {
    rpcState.data = { ok: true, used: 0, limit: 20 };
    await deductAiCredits("acct-1", 0);
    expect(rpcState.args).toEqual({ p_account_id: "acct-1", p_amount: 0 });
  });
});

describe("getAiCreditUsage", () => {
  it("selects ONLY the AI columns (no task/plan/Stripe leakage) and maps used/limit/remaining/period", async () => {
    usageState.row = {
      ai_credits_used: 120,
      ai_credits_limit: 500,
      ai_credits_period_started_at: "2026-06-05T00:00:00Z",
    };
    const usage = await getAiCreditUsage("acct-1");
    expect(usageState.selected).toContain("ai_credits_used");
    expect(usageState.selected).toContain("ai_credits_limit");
    expect(usageState.selected).toContain("ai_credits_period_started_at");
    // No-leak: the AI usage projection never selects task/plan/Stripe columns.
    expect(usageState.selected).not.toContain("stripe");
    expect(usageState.selected).not.toContain("tasks_used");
    expect(usage).toEqual({
      aiCreditsUsed: 120,
      aiCreditsLimit: 500,
      aiCreditsRemaining: 380,
      aiCreditsPeriodStartedAt: "2026-06-05T00:00:00Z",
    });
  });

  it("clamps remaining to 0 when used exceeds limit (never negative)", async () => {
    usageState.row = {
      ai_credits_used: 25,
      ai_credits_limit: 20,
      ai_credits_period_started_at: "2026-06-01T00:00:00Z",
    };
    const usage = await getAiCreditUsage("acct-1");
    expect(usage!.aiCreditsRemaining).toBe(0);
  });

  it("returns null when no billing row exists", async () => {
    usageState.row = null;
    expect(await getAiCreditUsage("acct-x")).toBeNull();
  });
});
