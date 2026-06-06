/**
 * @jest-environment node
 *
 * Slice 4.BILLING-PLAN-METADATA-5 / CS-4 — stripe_billing_events dedup repo. Mocks the
 * service-role client (maybeSingle read + upsert ON CONFLICT DO NOTHING write).
 */

interface ReadState {
  row: { event_id: string } | null;
  error: { message: string } | null;
}
interface WriteState {
  row?: Record<string, unknown>;
  opts?: unknown;
  error: { message: string } | null;
}
const readState: ReadState = { row: null, error: null };
const writeState: WriteState = { error: null };

function makeClient() {
  return {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          maybeSingle: jest.fn(async () => ({ data: readState.row, error: readState.error })),
        })),
      })),
      upsert: jest.fn(async (row: Record<string, unknown>, opts: unknown) => {
        writeState.row = row;
        writeState.opts = opts;
        return { error: writeState.error };
      }),
    })),
  };
}

jest.mock("@/repositories/supabase/serviceRoleClient", () => ({
  getServiceRoleClient: jest.fn(() => makeClient()),
}));

import { hasProcessed, recordProcessed } from "@/repositories/stripeBillingEvents";

beforeEach(() => {
  readState.row = null;
  readState.error = null;
  writeState.row = undefined;
  writeState.opts = undefined;
  writeState.error = null;
});

describe("hasProcessed", () => {
  it("true when a row exists, false when absent", async () => {
    readState.row = { event_id: "evt_1" };
    expect(await hasProcessed("evt_1")).toBe(true);
    readState.row = null;
    expect(await hasProcessed("evt_2")).toBe(false);
  });

  it("throws a generic error on a DB error", async () => {
    readState.error = { message: "boom" };
    await expect(hasProcessed("evt_1")).rejects.toThrow(/hasProcessed failed/);
  });
});

describe("recordProcessed", () => {
  it("upserts the safe fields with ON CONFLICT DO NOTHING (ignoreDuplicates)", async () => {
    await recordProcessed({ eventId: "evt_1", eventType: "customer.subscription.updated", accountId: "a1" });
    expect(writeState.row).toEqual({
      event_id: "evt_1",
      event_type: "customer.subscription.updated",
      account_id: "a1",
    });
    expect(writeState.opts).toEqual({ onConflict: "event_id", ignoreDuplicates: true });
  });

  it("stores a null account_id when none is provided", async () => {
    await recordProcessed({ eventId: "evt_2", eventType: "checkout.session.completed" });
    expect(writeState.row).toMatchObject({ account_id: null });
  });

  it("throws a generic error on a DB error", async () => {
    writeState.error = { message: "nope" };
    await expect(
      recordProcessed({ eventId: "evt_3", eventType: "x" }),
    ).rejects.toThrow(/recordProcessed failed/);
  });
});
