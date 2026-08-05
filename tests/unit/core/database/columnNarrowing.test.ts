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
import { narrowColumn, narrowNullableColumn } from "@/core/database/columnNarrowing";
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
