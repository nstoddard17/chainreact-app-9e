/**
 * @jest-environment node
 *
 * Slice 4.BILLING-INTERNAL-ENTITLEMENT-1 / BIE-1 — repositories/accountBilling
 * internal entitlement helpers.
 *
 * Proves:
 *   - getBillingModeServiceRole reads `billing_mode` via the SERVICE-ROLE client
 *     and fails safe to 'standard' when no row exists (never accidentally
 *     internal-free);
 *   - setBillingModeInternalFreeServiceRole writes all four internal columns
 *     together (consistency CHECK) with an audit reason that names the actor;
 *   - revertBillingModeToStandardServiceRole clears the metadata;
 *   - both writers throw when no billing row is hit (no silent no-op);
 *   - every mutation goes through the service-role client (no client write path).
 */

interface ReadState {
  row: Record<string, unknown> | null;
  error: { message: string } | null;
  selected?: string;
}
interface WriteState {
  patch?: Record<string, unknown>;
  eqArg?: unknown;
  selectRows: Array<Record<string, unknown>>;
  error: { message: string } | null;
}
const readState: ReadState = { row: null, error: null };
const writeState: WriteState = { selectRows: [], error: null };

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
          eq: jest.fn((_col: string, val: unknown) => {
            writeState.eqArg = val;
            return {
              select: jest.fn(async () => ({
                data: writeState.error ? null : writeState.selectRows,
                error: writeState.error,
              })),
            };
          }),
        };
      }),
    })),
  };
}

const reasons: string[] = [];
jest.mock("@/repositories/supabase/serviceRoleClient", () => ({
  getServiceRoleClient: jest.fn((reason: string) => {
    reasons.push(reason);
    return makeServiceRoleClient();
  }),
}));

import {
  getBillingModeServiceRole,
  setBillingModeInternalFreeServiceRole,
  revertBillingModeToStandardServiceRole,
} from "@/repositories/accountBilling";
import { getServiceRoleClient } from "@/repositories/supabase/serviceRoleClient";

beforeEach(() => {
  readState.row = null;
  readState.error = null;
  readState.selected = undefined;
  writeState.patch = undefined;
  writeState.eqArg = undefined;
  writeState.selectRows = [];
  writeState.error = null;
  reasons.length = 0;
  (getServiceRoleClient as jest.Mock).mockClear();
});

describe("getBillingModeServiceRole", () => {
  it("reads billing_mode via the service-role client", async () => {
    readState.row = { billing_mode: "internal_free" };
    const mode = await getBillingModeServiceRole("acct-1");
    expect(mode).toBe("internal_free");
    expect(getServiceRoleClient).toHaveBeenCalledTimes(1);
    expect(readState.selected).toContain("billing_mode");
  });

  it("fails safe to 'standard' when no billing row exists", async () => {
    readState.row = null;
    expect(await getBillingModeServiceRole("acct-missing")).toBe("standard");
  });

  it("throws a generic repo error on a DB error", async () => {
    readState.error = { message: "boom" };
    await expect(getBillingModeServiceRole("acct-1")).rejects.toThrow(
      /getBillingModeServiceRole failed/,
    );
  });
});

describe("setBillingModeInternalFreeServiceRole", () => {
  it("writes all four internal columns together with an audited actor reason", async () => {
    writeState.selectRows = [{ account_id: "acct-1" }];
    await setBillingModeInternalFreeServiceRole("acct-1", "qa", "user-9");
    expect(getServiceRoleClient).toHaveBeenCalledTimes(1);
    expect(writeState.patch).toMatchObject({
      billing_mode: "internal_free",
      internal_reason: "qa",
      internal_set_by_user_id: "user-9",
    });
    // internal_set_at stamped (consistency CHECK needs it non-null for internal_free).
    expect(typeof writeState.patch?.internal_set_at).toBe("string");
    expect(writeState.eqArg).toBe("acct-1");
    // Audit reason names the actor + account (service-role connection log).
    expect(reasons[0]).toContain("acct-1");
    expect(reasons[0]).toContain("user-9");
  });

  it("throws when no billing row is updated (bad account id)", async () => {
    writeState.selectRows = [];
    await expect(
      setBillingModeInternalFreeServiceRole("acct-x", "demo", "user-1"),
    ).rejects.toThrow(/no billing row for account acct-x/);
  });

  it("throws a generic repo error on a DB error", async () => {
    writeState.error = { message: "nope" };
    await expect(
      setBillingModeInternalFreeServiceRole("acct-1", "employee", "user-1"),
    ).rejects.toThrow(/setBillingModeInternalFreeServiceRole failed/);
  });
});

describe("revertBillingModeToStandardServiceRole", () => {
  it("clears all internal metadata in one write", async () => {
    writeState.selectRows = [{ account_id: "acct-1" }];
    await revertBillingModeToStandardServiceRole("acct-1");
    expect(writeState.patch).toEqual({
      billing_mode: "standard",
      internal_reason: null,
      internal_set_by_user_id: null,
      internal_set_at: null,
    });
    expect(getServiceRoleClient).toHaveBeenCalledTimes(1);
  });

  it("throws when no billing row is updated", async () => {
    writeState.selectRows = [];
    await expect(revertBillingModeToStandardServiceRole("acct-x")).rejects.toThrow(
      /no billing row for account acct-x/,
    );
  });
});
