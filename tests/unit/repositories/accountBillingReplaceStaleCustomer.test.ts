/**
 * @jest-environment node
 *
 * BILLING-CHECKOUT-PROD-1 — compare-and-set repair of a dead Stripe customer attachment.
 *
 * When Stripe reports the account's stored `stripe_customer_id` as `resource_missing` (the
 * customer was deleted, or belongs to the other Stripe mode) the account can never check out
 * again unless the attachment is replaced. The replacement must be narrow: it may only
 * overwrite the exact id proven dead, and only on an account with no subscription — so it can
 * never detach a paying account or clobber a concurrent writer.
 *
 * Mocks the service-role client's guarded `update().eq().eq().is().select()` chain plus the
 * re-read used when the guard rejects the write.
 */

interface GuardState {
  /** Rows returned by the guarded update (1 = we won, 0 = guard rejected / lost race). */
  updateRows: Array<{ stripe_customer_id: string }>;
  updateError: { message: string } | null;
  /** Value re-read when the guarded update matched nothing. */
  rereadId: string | null;
}
const guard: GuardState = { updateRows: [], updateError: null, rereadId: null };

/** Records the filters the repository actually applied, so the guard can be asserted. */
const applied: { patch?: Record<string, unknown>; eqs: Array<[string, unknown]>; isNull: string[] } =
  { eqs: [], isNull: [] };

function makeServiceRoleClient() {
  return {
    from: jest.fn(() => ({
      update: jest.fn((patch: Record<string, unknown>) => {
        applied.patch = patch;
        // `.eq()` is chainable (the repository applies two of them), so the object refers to
        // itself and needs an explicit type.
        interface UpdateChain {
          eq: (col: string, val: unknown) => UpdateChain;
          is: (col: string) => {
            select: () => Promise<{
              data: Array<{ stripe_customer_id: string }>;
              error: { message: string } | null;
            }>;
          };
        }
        const chain: UpdateChain = {
          eq: (col: string, val: unknown) => {
            applied.eqs.push([col, val]);
            return chain;
          },
          is: (col: string) => {
            applied.isNull.push(col);
            return {
              select: async () => ({
                data: guard.updateRows,
                error: guard.updateError,
              }),
            };
          },
        };
        return chain;
      }),
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

import { replaceStaleStripeCustomerServiceRole } from "@/repositories/accountBilling";

const ACCOUNT = "acct-1";

beforeEach(() => {
  guard.updateRows = [];
  guard.updateError = null;
  guard.rereadId = null;
  applied.patch = undefined;
  applied.eqs = [];
  applied.isNull = [];
});

describe("repairing a dead Stripe customer attachment", () => {
  it("replaces the attachment and reports the new customer", async () => {
    guard.updateRows = [{ stripe_customer_id: "cus_fresh" }];

    const result = await replaceStaleStripeCustomerServiceRole(
      ACCOUNT,
      "cus_stale",
      "cus_fresh",
    );

    expect(result).toEqual({ replaced: true, customerId: "cus_fresh" });
    expect(applied.patch).toEqual({ stripe_customer_id: "cus_fresh" });
  });

  it("only overwrites the exact id proven dead, on the target account", async () => {
    guard.updateRows = [{ stripe_customer_id: "cus_fresh" }];
    await replaceStaleStripeCustomerServiceRole(ACCOUNT, "cus_stale", "cus_fresh");

    // Both the account AND the stale id are part of the guard — a different account, or an
    // account whose id already changed, matches nothing.
    expect(applied.eqs).toEqual([
      ["account_id", ACCOUNT],
      ["stripe_customer_id", "cus_stale"],
    ]);
  });

  it("refuses to detach an account that already has a subscription", async () => {
    guard.updateRows = [{ stripe_customer_id: "cus_fresh" }];
    await replaceStaleStripeCustomerServiceRole(ACCOUNT, "cus_stale", "cus_fresh");
    expect(applied.isNull).toContain("stripe_subscription_id");
  });

  it("yields to a concurrent repair rather than overwriting the winner", async () => {
    guard.updateRows = []; // guard matched nothing — someone else already repaired it
    guard.rereadId = "cus_winner";

    const result = await replaceStaleStripeCustomerServiceRole(
      ACCOUNT,
      "cus_stale",
      "cus_mine",
    );

    expect(result).toEqual({ replaced: false, customerId: "cus_winner" });
  });

  it("surfaces a write failure instead of reporting a repair that did not happen", async () => {
    guard.updateError = { message: "permission denied" };
    await expect(
      replaceStaleStripeCustomerServiceRole(ACCOUNT, "cus_stale", "cus_fresh"),
    ).rejects.toThrow(/replaceStaleStripeCustomerServiceRole failed/);
  });
});
