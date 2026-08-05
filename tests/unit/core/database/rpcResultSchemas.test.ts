/**
 * @jest-environment node
 *
 * RPC-RETURN-CONTRACT-GUARD-1 — the runtime half of the RPC result contract.
 *
 * These schemas guard results the type system CANNOT describe: a jsonb-returning
 * function generates `Returns: Json`, a union with no field information, so
 * `tsc` cannot tell `{ok, applied, reason}` from `{}`. Before this arc the
 * callers asserted the shape with an unchecked `as`, on the results that decide
 * billing balances, entitlements, authorization and account ownership.
 *
 * The shapes below are taken from the real `jsonb_build_object(...)` branches in
 * the migrated database, and the db-ci billing/account groups execute every one
 * of these RPCs for real — so a schema that disagreed with production would fail
 * there, not here.
 */
import {
  accountInvitationRowSchema,
  apiKeyRateLimitRowSchema,
  businessTransitionResultSchema,
  claimAccountTrialResultSchema,
  deductResultSchema,
  parseRpcResult,
  reconcileReservationResultSchema,
  releaseExpiredResultSchema,
  releaseReservationResultSchema,
  reserveTasksResultSchema,
  scheduleAccountDeletionRowSchema,
} from "@/core/database/rpcResultSchemas";

describe("parseRpcResult — fails closed, and never leaks the payload", () => {
  it("returns the parsed value when the result matches", () => {
    const out = parseRpcResult("deduct_tasks_if_available", deductResultSchema, {
      ok: true,
      used: 3,
      limit: 100,
    });
    expect(out).toEqual({ ok: true, used: 3, limit: 100 });
  });

  it("throws naming the function when the result does not match", () => {
    expect(() =>
      parseRpcResult("deduct_tasks_if_available", deductResultSchema, { ok: true }),
    ).toThrow(/deduct_tasks_if_available returned a result that does not match its contract/);
  });

  it("never puts the payload into the error message", () => {
    let message = "";
    try {
      parseRpcResult("deduct_tasks_if_available", deductResultSchema, {
        ok: true,
        used: 3,
        limit: 100,
        account_id: "11111111-2222-3333-4444-555555555555",
        secret_balance: 987654,
      });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain("deduct_tasks_if_available");
    expect(message).not.toContain("11111111-2222-3333-4444-555555555555");
    expect(message).not.toContain("987654");
  });

  it("throws on null and on a non-object result", () => {
    for (const bad of [null, undefined, 42, "ok", []]) {
      expect(() => parseRpcResult("deduct_tasks_if_available", deductResultSchema, bad)).toThrow();
    }
  });
});

describe("business transition results (upgrade / downgrade)", () => {
  it("accepts the refusal branch and the success branch", () => {
    expect(
      businessTransitionResultSchema.parse({ ok: false, applied: false, reason: "account_frozen" }),
    ).toMatchObject({ ok: false, reason: "account_frozen" });
    // The success branch additionally reports the new shape + plan.
    expect(
      businessTransitionResultSchema.parse({
        ok: true,
        applied: true,
        reason: "upgraded",
        type: "organization",
        plan: "business",
      }),
    ).toMatchObject({ applied: true, plan: "business" });
  });

  it("REJECTS an unexpected added field — a changed contract is an error", () => {
    expect(() =>
      businessTransitionResultSchema.parse({
        ok: true,
        applied: true,
        reason: "upgraded",
        surprise_field: 1,
      }),
    ).toThrow();
  });

  it("never defaults a missing verdict field", () => {
    expect(() => businessTransitionResultSchema.parse({ applied: true, reason: "upgraded" })).toThrow();
    expect(() => businessTransitionResultSchema.parse({ ok: true, reason: "upgraded" })).toThrow();
  });
});

describe("usage + reservation results", () => {
  it("reserve requires the full counter set", () => {
    const ok = { ok: true, reason: "reserved", used: 1, reserved: 2, limit: 3, amount: 4 };
    expect(reserveTasksResultSchema.parse(ok)).toEqual(ok);
    expect(() => reserveTasksResultSchema.parse({ ok: true, reason: "reserved" })).toThrow();
  });

  it("reconcile and release allow their refusal branches to omit counters", () => {
    expect(reconcileReservationResultSchema.parse({ ok: false, reason: "run_not_found" })).toMatchObject({
      ok: false,
    });
    expect(releaseReservationResultSchema.parse({ ok: true, reason: "nothing_to_release", reserved: 0, limit: 5, released: 0 })).toMatchObject({
      released: 0,
    });
  });

  it("the expired sweep reports both counts", () => {
    expect(releaseExpiredResultSchema.parse({ ok: true, released_count: 2, released_tasks: 7 })).toEqual({
      ok: true,
      released_count: 2,
      released_tasks: 7,
    });
    expect(() => releaseExpiredResultSchema.parse({ ok: true, released_count: 2 })).toThrow();
  });
});

describe("authorization + ownership results", () => {
  it("schedule_account_deletion accepts only the outcomes the caller handles", () => {
    for (const out_outcome of [
      "scheduled",
      "already_pending",
      "no_authorization",
      "owned_accounts_block",
      "account_not_found",
    ]) {
      expect(
        scheduleAccountDeletionRowSchema.parse({
          out_outcome,
          out_account_id: null,
          out_deletion_status: null,
          out_deletion_requested_at: null,
          out_purge_after: null,
        }).out_outcome,
      ).toBe(out_outcome);
    }
  });

  it("REJECTS an outcome the caller has no branch for, instead of passing it through", () => {
    expect(() =>
      scheduleAccountDeletionRowSchema.parse({
        out_outcome: "some_new_outcome",
        out_account_id: null,
        out_deletion_status: null,
        out_deletion_requested_at: null,
        out_purge_after: null,
      }),
    ).toThrow();
  });

  it("invitation rows narrow role and status to the database's CHECK constraints", () => {
    const base = {
      id: "i",
      account_id: "a",
      email: "e@example.test",
      role: "member",
      status: "pending",
      invited_by_user_id: null,
      expires_at: null,
      accepted_by_user_id: null,
      accepted_at: null,
      revoked_at: null,
      created_at: "t",
      token_hash: "h",
    };
    expect(accountInvitationRowSchema.parse(base).role).toBe("member");
    expect(() => accountInvitationRowSchema.parse({ ...base, role: "owner" })).toThrow();
    expect(() => accountInvitationRowSchema.parse({ ...base, status: "unknown" })).toThrow();
  });
});

describe("rate-limit results are validated, never defaulted", () => {
  it("accepts a complete row", () => {
    expect(
      apiKeyRateLimitRowSchema.parse({ key_count: 1, workflow_count: 2, account_count: 3 }),
    ).toEqual({ key_count: 1, workflow_count: 2, account_count: 3 });
  });

  it("throws on a missing count rather than substituting zero", () => {
    // Substituting 0 would compare as "under the ceiling" and silently turn the
    // rate limiter into a no-op — the failure mode this validation exists for.
    expect(() => apiKeyRateLimitRowSchema.parse({ key_count: 1, workflow_count: 2 })).toThrow();
    expect(() =>
      apiKeyRateLimitRowSchema.parse({ key_count: 1, workflow_count: 2, account_count: null }),
    ).toThrow();
  });
});

describe("trial claim", () => {
  it("accepts both branches and keeps the origin plan open for narrowing", () => {
    const row = claimAccountTrialResultSchema.parse({
      claimed: true,
      trial_consumed_at: "t",
      trial_ends_at: "t2",
      trial_origin_plan: "pro",
    });
    expect(row.claimed).toBe(true);
    expect(row.trial_origin_plan).toBe("pro");
    expect(
      claimAccountTrialResultSchema.parse({
        claimed: false,
        trial_consumed_at: null,
        trial_ends_at: null,
        trial_origin_plan: null,
      }).claimed,
    ).toBe(false);
  });
});
