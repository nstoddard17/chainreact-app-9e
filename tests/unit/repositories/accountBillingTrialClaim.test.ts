/**
 * @jest-environment node
 *
 * PRO-TEAM-TRIAL-ENFORCEMENT-1 — account_billing trial repo helpers.
 *
 * Mocks the service-role client's `.rpc()` / `.select().eq().maybeSingle()` / `.update().eq()`
 * chains. Proves the claim wrapper maps the RPC's `claimed` result, the trial-state read maps
 * columns (and null on no row), and the window sync writes ONLY started/ends (never the consumed
 * marker or origin) and is a no-op on an empty patch.
 */

interface Recorder {
  rpcName?: string;
  rpcArgs?: Record<string, unknown>;
  rpcData?: unknown;
  selectData?: unknown;
  updatePatch?: Record<string, unknown>;
  updateEqArg?: unknown;
  error: { message: string } | null;
}
const rec: Recorder = { error: null };

function makeClient() {
  return {
    rpc: jest.fn(async (name: string, args: Record<string, unknown>) => {
      rec.rpcName = name;
      rec.rpcArgs = args;
      return { data: rec.rpcData, error: rec.error };
    }),
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          maybeSingle: jest.fn(async () => ({ data: rec.selectData, error: rec.error })),
        })),
      })),
      update: jest.fn((patch: Record<string, unknown>) => {
        rec.updatePatch = patch;
        return {
          eq: jest.fn(async (_c: string, v: unknown) => {
            rec.updateEqArg = v;
            return { error: rec.error };
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

import {
  claimAccountTrialServiceRole,
  getTrialStateServiceRole,
  syncTrialWindowServiceRole,
} from "@/repositories/accountBilling";

beforeEach(() => {
  rec.rpcName = undefined;
  rec.rpcArgs = undefined;
  rec.rpcData = undefined;
  rec.selectData = undefined;
  rec.updatePatch = undefined;
  rec.updateEqArg = undefined;
  rec.error = null;
  mockGetClient.mockClear();
});

describe("claimAccountTrialServiceRole", () => {
  it("calls the claim RPC with the account + origin plan + end, and maps claimed:true", async () => {
    rec.rpcData = {
      claimed: true,
      trial_consumed_at: "2026-07-29T00:00:00.000Z",
      trial_ends_at: "2026-07-29T00:00:00.000Z",
      trial_origin_plan: "pro",
    };
    const r = await claimAccountTrialServiceRole("acct-1", "pro", "2026-07-29T00:00:00.000Z");
    expect(rec.rpcName).toBe("claim_account_trial");
    expect(rec.rpcArgs).toEqual({
      p_account_id: "acct-1",
      p_origin_plan: "pro",
      p_trial_ends_at: "2026-07-29T00:00:00.000Z",
    });
    expect(r).toEqual({ claimed: true, trialEndsAt: "2026-07-29T00:00:00.000Z", originPlan: "pro" });
  });

  it("maps claimed:false (already consumed) with the pre-existing end", async () => {
    rec.rpcData = {
      claimed: false,
      trial_consumed_at: "2026-07-01T00:00:00.000Z",
      trial_ends_at: "2026-07-15T00:00:00.000Z",
      trial_origin_plan: "team",
    };
    const r = await claimAccountTrialServiceRole("acct-1", "team", "2026-08-01T00:00:00.000Z");
    expect(r).toEqual({ claimed: false, trialEndsAt: "2026-07-15T00:00:00.000Z", originPlan: "team" });
  });

  it("throws a generic repo error on an RPC error", async () => {
    rec.error = { message: "boom" };
    await expect(
      claimAccountTrialServiceRole("acct-1", "pro", "2026-07-29T00:00:00.000Z"),
    ).rejects.toThrow(/claim_account_trial RPC failed/);
  });
});

describe("getTrialStateServiceRole", () => {
  it("maps the trial columns", async () => {
    rec.selectData = {
      trial_started_at: "2026-07-01T00:00:00.000Z",
      trial_consumed_at: "2026-07-01T00:00:00.000Z",
      trial_ends_at: "2026-07-15T00:00:00.000Z",
      trial_origin_plan: "pro",
    };
    expect(await getTrialStateServiceRole("acct-1")).toEqual({
      consumedAt: "2026-07-01T00:00:00.000Z",
      startedAt: "2026-07-01T00:00:00.000Z",
      endsAt: "2026-07-15T00:00:00.000Z",
      originPlan: "pro",
    });
  });

  it("returns null when there is no billing row", async () => {
    rec.selectData = null;
    expect(await getTrialStateServiceRole("acct-1")).toBeNull();
  });
});

describe("syncTrialWindowServiceRole — window only, never the consumed marker", () => {
  it("writes only trial_started_at / trial_ends_at (snake_cased), keyed on account_id", async () => {
    await syncTrialWindowServiceRole("acct-1", {
      trialStartedAt: "2026-07-01T00:00:00.000Z",
      trialEndsAt: "2026-07-15T00:00:00.000Z",
    });
    expect(rec.updatePatch).toEqual({
      trial_started_at: "2026-07-01T00:00:00.000Z",
      trial_ends_at: "2026-07-15T00:00:00.000Z",
    });
    // The permanent marker + origin are NEVER written by the window sync.
    expect(rec.updatePatch).not.toHaveProperty("trial_consumed_at");
    expect(rec.updatePatch).not.toHaveProperty("trial_origin_plan");
    expect(rec.updateEqArg).toBe("acct-1");
  });

  it("writes a partial patch (ends only)", async () => {
    await syncTrialWindowServiceRole("acct-1", { trialEndsAt: "2026-07-15T00:00:00.000Z" });
    expect(rec.updatePatch).toEqual({ trial_ends_at: "2026-07-15T00:00:00.000Z" });
  });

  it("is a no-op (no client) on an empty patch", async () => {
    await syncTrialWindowServiceRole("acct-1", {});
    expect(mockGetClient).not.toHaveBeenCalled();
  });
});
