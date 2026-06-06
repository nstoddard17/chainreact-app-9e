/**
 * @jest-environment node
 *
 * Slice 4.BILLING-PLAN-METADATA-4 / CS-3 — race-safe lazy customer attach in
 * repositories/accountBilling. Mocks the service-role client's guarded
 * `update().eq().is().select()` chain + the re-read on a lost race.
 */

interface GuardState {
  /** rows returned by the guarded update (1 = we won, 0 = lost / already set). */
  updateRows: Array<{ stripe_customer_id: string }>;
  updateError: { message: string } | null;
  /** value re-read after a lost race. */
  rereadId: string | null;
}
const guard: GuardState = { updateRows: [], updateError: null, rereadId: null };

function makeServiceRoleClient() {
  return {
    from: jest.fn(() => ({
      // guarded write: update().eq().is().select()
      update: jest.fn(() => ({
        eq: jest.fn(() => ({
          is: jest.fn(() => ({
            select: jest.fn(async () => ({ data: guard.updateRows, error: guard.updateError })),
          })),
        })),
      })),
      // re-read: select().eq().maybeSingle()
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          maybeSingle: jest.fn(async () => ({
            data:
              guard.rereadId === null
                ? null
                : {
                    stripe_customer_id: guard.rereadId,
                    stripe_subscription_id: null,
                    cancel_at_period_end: false,
                    current_period_end: null,
                  },
            error: null,
          })),
        })),
      })),
    })),
  };
}

jest.mock("@/repositories/supabase/serviceRoleClient", () => ({
  getServiceRoleClient: jest.fn(() => makeServiceRoleClient()),
}));

import { attachStripeCustomerIfAbsentServiceRole } from "@/repositories/accountBilling";

beforeEach(() => {
  guard.updateRows = [];
  guard.updateError = null;
  guard.rereadId = null;
});

describe("attachStripeCustomerIfAbsentServiceRole", () => {
  it("stores when absent (won the write) → { stored: true, customerId }", async () => {
    guard.updateRows = [{ stripe_customer_id: "cus_mine" }];
    const r = await attachStripeCustomerIfAbsentServiceRole("acct-1", "cus_mine");
    expect(r).toEqual({ stored: true, customerId: "cus_mine" });
  });

  it("lost the race → re-reads the winner's id, returns { stored: false, winner }", async () => {
    guard.updateRows = []; // guarded update wrote nothing (already set)
    guard.rereadId = "cus_winner";
    const r = await attachStripeCustomerIfAbsentServiceRole("acct-1", "cus_mine");
    expect(r).toEqual({ stored: false, customerId: "cus_winner" });
  });

  it("falls back to the attempted id if the re-read is unexpectedly empty", async () => {
    guard.updateRows = [];
    guard.rereadId = null;
    const r = await attachStripeCustomerIfAbsentServiceRole("acct-1", "cus_mine");
    expect(r).toEqual({ stored: false, customerId: "cus_mine" });
  });

  it("throws a generic repository error on a DB error", async () => {
    guard.updateError = { message: "boom" };
    await expect(attachStripeCustomerIfAbsentServiceRole("acct-1", "cus_x")).rejects.toThrow(
      /attachStripeCustomerIfAbsentServiceRole failed/,
    );
  });
});
