/**
 * @jest-environment node
 *
 * initAccountBillingServiceRole stamps tasks_limit from planPolicy on insert (PRICING-LOCK).
 * Captures the upserted row via a service-role client mock and proves: Team is born at 7,500
 * (not the column default 100), Free at 100, Business at 25,000, an uncapped Enterprise plan
 * leaves the column default (no tasks_limit), the insert is conflict-ignoring (never
 * overwrites an existing row), and the no-plan path stays metadata-free.
 */
import { planLimitsFor } from "@/core/billing/planPolicy";

const upsertState: {
  row?: Record<string, unknown>;
  options?: unknown;
  error: { message: string } | null;
} = { error: null };

const mockUpsert = jest.fn((row: Record<string, unknown>, options: unknown) => {
  upsertState.row = row;
  upsertState.options = options;
  return Promise.resolve({ error: upsertState.error });
});

jest.mock("@/repositories/supabase/serviceRoleClient", () => ({
  getServiceRoleClient: jest.fn(() => ({
    from: jest.fn(() => ({
      upsert: (row: Record<string, unknown>, options: unknown) => mockUpsert(row, options),
    })),
  })),
}));

import { initAccountBillingServiceRole } from "@/repositories/accountBilling";

beforeEach(() => {
  upsertState.row = undefined;
  upsertState.options = undefined;
  upsertState.error = null;
  mockUpsert.mockClear();
});

describe("initAccountBillingServiceRole — task cap stamping (PRICING-LOCK)", () => {
  it("stamps the Team task + AI credit caps (7,500 / 10,000) from policy on a new team billing row", async () => {
    await initAccountBillingServiceRole("acct-team", "team");
    expect(upsertState.row).toMatchObject({
      account_id: "acct-team",
      plan: "team",
      tasks_limit: 7500,
      ai_credits_limit: 10000,
    });
    expect(upsertState.row!.tasks_limit).toBe(planLimitsFor("team").taskLimit);
    expect(upsertState.row!.ai_credits_limit).toBe(planLimitsFor("team").aiCreditsMonthlyLimit);
  });

  it("stamps the Free caps (100 tasks / 100 AI credits) for a free plan", async () => {
    await initAccountBillingServiceRole("acct-free", "free");
    expect(upsertState.row).toMatchObject({ plan: "free", tasks_limit: 100, ai_credits_limit: 100 });
  });

  it("stamps the Business caps (25,000 / 50,000) for a business plan", async () => {
    await initAccountBillingServiceRole("acct-biz", "business");
    expect(upsertState.row).toMatchObject({
      plan: "business",
      tasks_limit: 25000,
      ai_credits_limit: 50000,
    });
  });

  it("does NOT stamp caps for an uncapped (Enterprise) plan — leaves the column defaults", async () => {
    await initAccountBillingServiceRole("acct-ent", "enterprise");
    expect(upsertState.row).toMatchObject({ account_id: "acct-ent", plan: "enterprise" });
    expect(upsertState.row).not.toHaveProperty("tasks_limit");
    expect(upsertState.row).not.toHaveProperty("ai_credits_limit");
  });

  it("inserts conflict-ignoring so an existing billing row is never overwritten", async () => {
    await initAccountBillingServiceRole("acct-team", "team");
    expect(upsertState.options).toEqual({ onConflict: "account_id", ignoreDuplicates: true });
  });

  it("omits plan + cap when no plan is given (trigger-seeded personal path)", async () => {
    await initAccountBillingServiceRole("acct-x");
    expect(upsertState.row).toEqual({ account_id: "acct-x" });
  });
});
