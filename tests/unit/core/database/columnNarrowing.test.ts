/**
 * @jest-environment node
 *
 * SUPABASE-TABLE-TYPING-1A — the runtime half of table typing.
 *
 * PostgreSQL enforces closed value sets with CHECK constraints on plain `text`
 * columns, which the Supabase generator can only call `string`. The
 * repositories model those columns as closed unions, and used to bridge the gap
 * with an unchecked handwritten row interface — so an unrecognised plan tier or
 * deletion state would have flowed into a billing or lifecycle decision wearing
 * a type it did not have. These helpers make that failure loud.
 */
import {
  narrowColumn,
  narrowNullableColumn,
  requireFiniteNumber,
} from "@/core/database/columnNarrowing";
import { PLAN_STATUSES, PLAN_TIERS } from "@/core/billing/planPolicy";
import { ACCOUNT_DELETION_STATUSES } from "@/repositories/accountDeletions";

describe("narrowColumn — fails closed on an unknown value", () => {
  it("returns every value the constraint allows", () => {
    for (const tier of PLAN_TIERS) {
      expect(narrowColumn("account_billing.plan", PLAN_TIERS, tier)).toBe(tier);
    }
    for (const status of PLAN_STATUSES) {
      expect(narrowColumn("account_billing.plan_status", PLAN_STATUSES, status)).toBe(status);
    }
    for (const status of ACCOUNT_DELETION_STATUSES) {
      expect(narrowColumn("account_deletions.status", ACCOUNT_DELETION_STATUSES, status)).toBe(status);
    }
  });

  it("throws on an unrecognised value instead of coercing it", () => {
    expect(() => narrowColumn("account_billing.plan", PLAN_TIERS, "platinum")).toThrow(
      /account_billing\.plan: unexpected value "platinum"/,
    );
  });

  it("throws on NULL rather than substituting a default tier", () => {
    // A missing plan must never silently become "free": that would grant or
    // revoke entitlements based on absent data.
    expect(() => narrowColumn("account_billing.plan", PLAN_TIERS, null)).toThrow(
      /unexpected value null/,
    );
  });

  it("names the offending column and the allowed set", () => {
    let message = "";
    try {
      narrowColumn("account_deletions.status", ACCOUNT_DELETION_STATUSES, "deleted");
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain("account_deletions.status");
    expect(message).toContain("pending, cancelled, purged");
  });

  it("is not fooled by case or whitespace", () => {
    for (const bad of ["Free", " free", "free "]) {
      expect(() => narrowColumn("account_billing.plan", PLAN_TIERS, bad)).toThrow();
    }
  });
});

describe("narrowNullableColumn — preserves a genuine NULL", () => {
  const TRIAL_ORIGINS = ["pro", "team"] as const;

  it("passes NULL through (no trial origin is a real state)", () => {
    expect(narrowNullableColumn("account_billing.trial_origin_plan", TRIAL_ORIGINS, null)).toBeNull();
  });

  it("still narrows a present value", () => {
    expect(narrowNullableColumn("account_billing.trial_origin_plan", TRIAL_ORIGINS, "pro")).toBe("pro");
  });

  it("still throws on an unrecognised present value", () => {
    expect(() =>
      narrowNullableColumn("account_billing.trial_origin_plan", TRIAL_ORIGINS, "enterprise"),
    ).toThrow(/unexpected value "enterprise"/);
  });
});

/**
 * SUPABASE-TABLE-TYPING-1C — a numeric aggregate must never degrade silently.
 *
 * `Number(row.runs)` turns a NULL, an empty string or a non-numeric cell into
 * `NaN`, which then poisons every downstream sum without ever throwing, and a
 * `?? 0` fallback is worse still: it asserts "no runs" on the strength of a
 * failed parse. Both are rejected here.
 */
describe("requireFiniteNumber — analytics aggregates fail closed", () => {
  const COL = "analytics_runs_aggregate.runs";

  it("accepts a JSON number", () => {
    expect(requireFiniteNumber(COL, 42)).toBe(42);
    expect(requireFiniteNumber(COL, 0)).toBe(0);
    expect(requireFiniteNumber(COL, -3.5)).toBe(-3.5);
  });

  it("accepts the numeric STRING PostgREST may return for bigint/numeric", () => {
    expect(requireFiniteNumber(COL, "42")).toBe(42);
    expect(requireFiniteNumber(COL, "0")).toBe(0);
    expect(requireFiniteNumber(COL, " 7 ")).toBe(7);
  });

  it("rejects NULL rather than defaulting it to zero", () => {
    expect(() => requireFiniteNumber(COL, null)).toThrow(
      /analytics_runs_aggregate\.runs: expected a finite numeric aggregate, received null/,
    );
  });

  it("rejects undefined, empty and non-numeric text", () => {
    for (const bad of [undefined, "", "   ", "abc", "12abc", {}, []]) {
      expect(() => requireFiniteNumber(COL, bad)).toThrow(/expected a finite numeric aggregate/);
    }
  });

  it("rejects NaN and the infinities instead of propagating them", () => {
    for (const bad of [Number.NaN, Infinity, -Infinity, "NaN", "Infinity"]) {
      expect(() => requireFiniteNumber(COL, bad)).toThrow(/expected a finite numeric aggregate/);
    }
  });

  it("names the column and the received TYPE, never the raw value", () => {
    // An aggregate cell is not a closed vocabulary the way a plan tier is, so
    // the message must not echo whatever the database actually returned.
    expect(() => requireFiniteNumber(COL, "s3cret-looking-garbage")).toThrow(
      /analytics_runs_aggregate\.runs: expected a finite numeric aggregate, received string/,
    );
    try {
      requireFiniteNumber(COL, "s3cret-looking-garbage");
      throw new Error("expected requireFiniteNumber to throw");
    } catch (e) {
      expect((e as Error).message).not.toContain("s3cret-looking-garbage");
    }
  });
});
