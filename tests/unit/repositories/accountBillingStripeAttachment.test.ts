/**
 * @jest-environment node
 *
 * Slice 4.BILLING-PLAN-METADATA-3 / CS-2 — repositories/accountBilling Stripe attachment.
 *
 * Proves:
 *   - getStripeAttachmentServiceRole reads via the SERVICE-ROLE client + maps row → DTO;
 *   - updateStripeAttachmentServiceRole writes only the provided fields (service-role);
 *   - the client-facing getUsage projection NEVER selects or returns the Stripe ids
 *     (no-leak: Account Settings can't see stripe_customer_id / stripe_subscription_id).
 */

// ── service-role client mock (read = maybeSingle, write = update.eq) ──────────
interface ReadState {
  row: Record<string, unknown> | null;
  error: { message: string } | null;
  selected?: string;
}
interface WriteState {
  patch?: Record<string, unknown>;
  eqArg?: unknown;
  error: { message: string } | null;
}
const readState: ReadState = { row: null, error: null };
const writeState: WriteState = { error: null };

function makeServiceRoleClient() {
  return {
    from: jest.fn(() => ({
      select: jest.fn((cols: string) => {
        readState.selected = cols;
        return {
          eq: jest.fn(() => ({
            maybeSingle: jest.fn(async () => ({ data: readState.row, error: readState.error })),
          })),
        };
      }),
      update: jest.fn((patch: Record<string, unknown>) => {
        writeState.patch = patch;
        return {
          eq: jest.fn(async (_col: string, val: unknown) => {
            writeState.eqArg = val;
            return { error: writeState.error };
          }),
        };
      }),
    })),
  };
}

// ── SSR-cookie client mock (getUsage projection capture) ─────────────────────
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

import {
  getStripeAttachmentServiceRole,
  updateStripeAttachmentServiceRole,
  getUsage,
} from "@/repositories/accountBilling";
import { getServiceRoleClient } from "@/repositories/supabase/serviceRoleClient";

beforeEach(() => {
  readState.row = null;
  readState.error = null;
  readState.selected = undefined;
  writeState.patch = undefined;
  writeState.eqArg = undefined;
  writeState.error = null;
  usageState.row = null;
  usageState.error = null;
  usageState.selected = undefined;
  (getServiceRoleClient as jest.Mock).mockClear();
});

describe("getStripeAttachmentServiceRole", () => {
  it("uses the service-role client and maps the row to the DTO", async () => {
    readState.row = {
      stripe_customer_id: "cus_1",
      stripe_subscription_id: "sub_1",
      cancel_at_period_end: true,
      current_period_end: "2026-07-01T00:00:00Z",
    };
    const out = await getStripeAttachmentServiceRole("acct-1");
    expect(getServiceRoleClient).toHaveBeenCalledTimes(1);
    expect(out).toEqual({
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
      cancelAtPeriodEnd: true,
      currentPeriodEnd: "2026-07-01T00:00:00Z",
    });
    // selects exactly the Stripe attachment columns.
    expect(readState.selected).toContain("stripe_customer_id");
    expect(readState.selected).toContain("stripe_subscription_id");
  });

  it("returns null when no billing row exists", async () => {
    readState.row = null;
    expect(await getStripeAttachmentServiceRole("acct-x")).toBeNull();
  });

  it("throws a generic repository error on a DB error", async () => {
    readState.error = { message: "boom" };
    await expect(getStripeAttachmentServiceRole("acct-1")).rejects.toThrow(
      /getStripeAttachmentServiceRole failed/,
    );
  });
});

describe("updateStripeAttachmentServiceRole", () => {
  it("writes only the provided fields via the service-role client", async () => {
    await updateStripeAttachmentServiceRole("acct-1", {
      stripeCustomerId: "cus_9",
      cancelAtPeriodEnd: false,
    });
    expect(getServiceRoleClient).toHaveBeenCalledTimes(1);
    expect(writeState.patch).toEqual({ stripe_customer_id: "cus_9", cancel_at_period_end: false });
    expect(writeState.eqArg).toBe("acct-1");
  });

  it("maps explicit null to a column clear", async () => {
    await updateStripeAttachmentServiceRole("acct-1", { stripeSubscriptionId: null });
    expect(writeState.patch).toEqual({ stripe_subscription_id: null });
  });

  it("is a no-op (no client, no write) when given an empty patch", async () => {
    await updateStripeAttachmentServiceRole("acct-1", {});
    expect(getServiceRoleClient).not.toHaveBeenCalled();
    expect(writeState.patch).toBeUndefined();
  });

  it("throws a generic repository error on a DB error", async () => {
    writeState.error = { message: "nope" };
    await expect(
      updateStripeAttachmentServiceRole("acct-1", { stripeCustomerId: "cus_z" }),
    ).rejects.toThrow(/updateStripeAttachmentServiceRole failed/);
  });
});

describe("getUsage — no-leak client projection", () => {
  it("does NOT select the Stripe id columns", async () => {
    usageState.row = {
      tasks_used: 1,
      tasks_limit: 100,
      period_started_at: "2026-06-01T00:00:00Z",
      plan: "free",
      plan_status: "active",
    };
    await getUsage("acct-1");
    expect(usageState.selected).toBeDefined();
    expect(usageState.selected).not.toContain("stripe_customer_id");
    expect(usageState.selected).not.toContain("stripe_subscription_id");
  });

  it("returns a DTO with no Stripe id keys even if the row carried them", async () => {
    // Defense-in-depth: even a row that somehow includes the ids must not surface them.
    usageState.row = {
      tasks_used: 1,
      tasks_limit: 100,
      period_started_at: "2026-06-01T00:00:00Z",
      plan: "free",
      plan_status: "active",
      stripe_customer_id: "cus_leak",
      stripe_subscription_id: "sub_leak",
    };
    const usage = await getUsage("acct-1");
    const serialized = JSON.stringify(usage);
    expect(serialized).not.toContain("cus_leak");
    expect(serialized).not.toContain("sub_leak");
    expect(serialized).not.toContain("stripe");
  });
});
