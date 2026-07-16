/**
 * @jest-environment node
 *
 * PRO-TEAM-TRIAL-ENFORCEMENT-1 — static guards for the account_billing trial migration.
 *
 * Reads the SQL (no DB): the trial columns + origin-plan CHECK exist, the atomic claim RPC is
 * SECURITY DEFINER / fixed search_path / service-role only, is a compare-and-set on
 * `trial_consumed_at IS NULL` (not a read-then-write), RAISES on a non-Pro/Team origin plan,
 * never clears the consumed marker, adds no table / no client grant.
 */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const MIGRATIONS = resolve(process.cwd(), "supabase/migrations");
const FILE = "20260721000000_account_billing_trial.sql";
const sql = readFileSync(join(MIGRATIONS, FILE), "utf8");
const code = sql.replace(/--[^\n]*/g, "");

describe("account_billing trial migration (static guards)", () => {
  it("adds the four trial columns", () => {
    expect(code).toMatch(/ADD\s+COLUMN\s+trial_consumed_at\s+timestamptz/i);
    expect(code).toMatch(/ADD\s+COLUMN\s+trial_started_at\s+timestamptz/i);
    expect(code).toMatch(/ADD\s+COLUMN\s+trial_ends_at\s+timestamptz/i);
    expect(code).toMatch(/ADD\s+COLUMN\s+trial_origin_plan\s+text/i);
  });

  it("constrains the origin plan to pro/team (or null)", () => {
    expect(code).toMatch(/trial_origin_plan\s+IS\s+NULL\s+OR\s+trial_origin_plan\s+IN\s*\(\s*'pro'\s*,\s*'team'\s*\)/i);
  });

  it("defines claim_account_trial as SECURITY DEFINER with a fixed search_path", () => {
    expect(code).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.claim_account_trial/i);
    expect(code).toMatch(/SECURITY\s+DEFINER/i);
    expect(code).toMatch(/SET\s+search_path\s*=\s*public/i);
  });

  it("is service-role only — revoked from public/anon/authenticated, granted service_role", () => {
    expect(code).toMatch(
      /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.claim_account_trial[\s\S]*FROM\s+public,\s*anon,\s*authenticated/i,
    );
    expect(code).toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.claim_account_trial[\s\S]*TO\s+service_role/i,
    );
    expect(code).not.toMatch(/GRANT\s+EXECUTE[\s\S]*claim_account_trial[\s\S]*TO\s+authenticated/i);
    expect(code).not.toMatch(/GRANT\s+EXECUTE[\s\S]*claim_account_trial[\s\S]*TO\s+anon/i);
  });

  it("is an ATOMIC compare-and-set on trial_consumed_at IS NULL (not a read-then-write)", () => {
    expect(code).toMatch(
      /UPDATE\s+public\.account_billing[\s\S]*SET\s+trial_consumed_at\s*=\s*now\(\)[\s\S]*WHERE\s+account_id\s*=\s*p_account_id[\s\S]*AND\s+trial_consumed_at\s+IS\s+NULL/i,
    );
  });

  it("restricts the claim to a server-validated Pro/Team origin plan (RAISE otherwise)", () => {
    expect(code).toMatch(/p_origin_plan\s+NOT\s+IN\s*\(\s*'pro'\s*,\s*'team'\s*\)/i);
    expect(code).toMatch(/RAISE\s+EXCEPTION/i);
  });

  it("NEVER clears the consumed marker — no `trial_consumed_at = NULL` write exists", () => {
    expect(code).not.toMatch(/trial_consumed_at\s*=\s*NULL/i);
  });

  it("adds no table and no client write policy / grant", () => {
    expect(code).not.toMatch(/CREATE\s+TABLE/i);
    expect(code).not.toMatch(/CREATE\s+POLICY/i);
  });
});
