/**
 * @jest-environment node
 *
 * Static guard for the co-member RLS migration (Slice 4.ACCOUNT-MODEL-16).
 * Reads the SQL (no DB): self-only SELECT replaced by a co-member policy backed
 * by a SECURITY DEFINER is_account_member() helper (recursion-safe); additive
 * only (no table/data/trigger/FK change).
 */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const MIGRATIONS = resolve(process.cwd(), "supabase/migrations");
const sql = readFileSync(
  join(MIGRATIONS, "20260531000012_account_memberships_co_member_rls.sql"),
  "utf8",
);
const code = sql.replace(/--[^\n]*/g, "");

describe("4.ACCOUNT-MODEL-16 — co-member RLS (static guards)", () => {
  it("defines is_account_member as SECURITY DEFINER (recursion-safe)", () => {
    expect(code).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.is_account_member\(p_account_id\s+uuid\)/i);
    expect(code).toMatch(/SECURITY\s+DEFINER/i);
    expect(code).toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.is_account_member\(uuid\)\s+TO\s+authenticated,\s*anon/i);
  });

  it("replaces self-only SELECT with a co-member policy using the helper", () => {
    expect(code).toMatch(/DROP\s+POLICY\s+IF\s+EXISTS\s+account_memberships_select_self\s+ON\s+public\.account_memberships/i);
    expect(code).toMatch(/CREATE\s+POLICY\s+account_memberships_select_co_member\s+ON\s+public\.account_memberships/i);
    expect(code).toMatch(/USING\s*\(\s*public\.is_account_member\(account_id\)\s*\)/i);
  });

  it("the policy body does NOT inline a self-referential subquery (recursion)", () => {
    // The co-member check goes THROUGH the SECURITY DEFINER function, not a raw
    // EXISTS on account_memberships inside the policy.
    expect(code).not.toMatch(/USING\s*\([^)]*EXISTS[^)]*account_memberships/i);
  });

  it("is additive only — no table/data/trigger/FK change", () => {
    expect(code).not.toMatch(/CREATE\s+TABLE/i);
    expect(code).not.toMatch(/INSERT\s+INTO|UPDATE\s+public\.|DELETE\s+FROM/i);
    expect(code).not.toMatch(/CREATE\s+TRIGGER|DROP\s+TRIGGER/i);
    expect(code).not.toMatch(/REFERENCES|FOREIGN\s+KEY|DROP\s+CONSTRAINT/i);
  });
});
