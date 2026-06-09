/**
 * @jest-environment node
 *
 * Static guard for lazy task-period rollover (20260620000000).
 *
 * Reads the migration SQL (no DB) so CI proves, on every run, the shape of the
 * rollover: a period-anchor helper, rollover wired into deduct + reserve (reset
 * usage/reserved + advance period under a row lock, BEFORE the cap check), the
 * custom-cap invariant (tasks_limit is never reset), and that reconcile/release
 * are NOT redefined here. Live behavioral proof is the opt-in DB harness
 * (accountBillingFoundation.dev.test.ts → "Lazy task-period rollover").
 */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const MIGRATIONS = resolve(process.cwd(), "supabase/migrations");
const FILE = "20260620000000_lazy_task_period_rollover.sql";
const sql = readFileSync(join(MIGRATIONS, FILE), "utf8");
const code = sql.replace(/--[^\n]*/g, ""); // strip comments for code assertions

describe("20260620000000 — lazy task-period rollover (static guards)", () => {
  it("defines the period-anchor helper, service_role-only, IMMUTABLE", () => {
    expect(code).toMatch(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.account_billing_period_start\(\s*p_anchor\s+timestamptz,\s*p_at\s+timestamptz/i,
    );
    expect(code).toMatch(/IMMUTABLE/i);
    expect(code).toMatch(/make_interval\(months\s*=>\s*v_months\)/i);
    expect(code).toMatch(
      /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.account_billing_period_start[^;]*FROM\s+public,\s*anon,\s*authenticated/i,
    );
    expect(code).toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.account_billing_period_start[^;]*TO\s+service_role/i,
    );
  });

  it("redefines deduct + reserve under the CANONICAL names (post-rename), SECURITY DEFINER", () => {
    expect(code).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.deduct_tasks_if_available\(\s*p_account_id\s+uuid/i);
    expect(code).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.reserve_tasks_if_available\(\s*p_account_id\s+uuid/i);
    expect(code).not.toMatch(/_v2\b/); // canonical names only — these were renamed in ...000004
    expect((code.match(/SECURITY\s+DEFINER/gi) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("wires rollover into BOTH deduct and reserve: locked read + period advance + counter reset", () => {
    // The rollover block (helper call + conditional reset) appears in each function body.
    expect((code.match(/account_billing_period_start\(\s*v_anchor\s*,\s*now\(\)\s*\)/gi) ?? []).length)
      .toBeGreaterThanOrEqual(2);
    expect((code.match(/SELECT\s+period_started_at\s+INTO\s+v_anchor[\s\S]*?FOR\s+UPDATE/gi) ?? []).length)
      .toBeGreaterThanOrEqual(2);
    // The reset zeroes usage + reservations and advances the anchor.
    expect((code.match(/SET\s+tasks_used\s*=\s*0,\s*tasks_reserved\s*=\s*0,\s*period_started_at\s*=\s*v_new_start/gi) ?? []).length)
      .toBeGreaterThanOrEqual(2);
    // Only advance when the period actually elapsed.
    expect(code).toMatch(/IF\s+v_new_start\s*>\s*v_anchor\s+THEN/i);
  });

  it("INVARIANT: the rollover reset NEVER writes tasks_limit (custom/Stripe cap survives)", () => {
    // The reset UPDATEs set used/reserved/period only — assert no tasks_limit assignment
    // appears in any reset block.
    for (const m of code.matchAll(/SET\s+tasks_used\s*=\s*0[\s\S]*?WHERE\s+account_id\s*=\s*p_account_id;/gi)) {
      expect(m[0]).not.toMatch(/tasks_limit\s*=/i);
    }
  });

  it("does NOT redefine reconcile / release / release_expired (out of scope; their GREATEST guards stay)", () => {
    expect(code).not.toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.reconcile_task_reservation\b/i);
    expect(code).not.toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.release_task_reservation\b/i);
    expect(code).not.toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.release_expired_reservations\b/i);
  });

  it("does NOT add a cron, change tasks_limit defaults, or touch PLAN_LIMITS / Stripe", () => {
    expect(code).not.toMatch(/CREATE\s+TABLE/i); // no schema change
    expect(code).not.toMatch(/ALTER\s+TABLE\s+public\.account_billing/i); // no column/default change
    expect(code).not.toMatch(/cron/i);
    expect(code).not.toMatch(/stripe/i);
  });
});
