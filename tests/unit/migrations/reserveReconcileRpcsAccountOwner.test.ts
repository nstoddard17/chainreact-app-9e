/**
 * @jest-environment node
 *
 * Static guard for the reserve/reconcile RPC hygiene fix (Slice 4.ACCOUNT-MODEL-9a).
 *
 * Phase B's workflow_runs cutover (20260530000004) dropped workflow_runs.user_id,
 * but the four reserve/reconcile RPCs (defined in 20260525000002) still queried
 * that column — a live-schema correctness bug (release_expired_reservations is
 * hit by an un-gated 10-min cron). 20260531000000 re-creates the RPCs to recover
 * the billed user via the surviving account-owner path
 * (workflow_runs.account_id → accounts.owner_user_id) WITHOUT re-keying billing
 * to account (that is Phase C / 9b+).
 *
 * This test reads the migration SQL directly (no DB) so CI proves, on every run,
 * that the EFFECTIVE RPC definitions no longer reference the dropped column and
 * that billing stays user-scoped. The live functional proof is the opt-in DB
 * harness `npm run verify:reserve-reconcile`.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const MIGRATIONS = resolve(process.cwd(), "supabase/migrations");
const FIX = "20260531000000_fix_reserve_reconcile_rpcs_account_owner.sql";

const RPCS = [
  "reserve_tasks_if_available",
  "reconcile_task_reservation",
  "release_task_reservation",
  "release_expired_reservations",
] as const;

function read(file: string): string {
  return readFileSync(join(MIGRATIONS, file), "utf8");
}

const fixSql = read(FIX);
// Executable SQL only — the header/inline comments deliberately quote the OLD
// broken `workflow_runs.user_id` predicate to document the fix, so the
// dropped-column assertions must ignore comments.
const fixCode = fixSql.replace(/--[^\n]*/g, "");

describe("4.ACCOUNT-MODEL-9a — reserve/reconcile RPC hygiene fix", () => {
  it("is the effective (last) definer of each RPC — fix, except reserve which rollover supersedes", () => {
    const files = readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    // reserve_tasks_if_available is legitimately redefined LAST by the lazy
    // task-period rollover (20260620000000), which preserves the 9a account-keyed
    // run lookup and only adds period rollover. The other three remain fix-last.
    const ROLLOVER = "20260620000000_lazy_task_period_rollover.sql";
    const expectedLast: Partial<Record<(typeof RPCS)[number], string>> = {
      reserve_tasks_if_available: ROLLOVER,
    };
    for (const rpc of RPCS) {
      const definers = files.filter((f) =>
        new RegExp(
          `CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+public\\.${rpc}\\b`,
          "i",
        ).test(read(f)),
      );
      // defined originally in 20260525000002, re-created in the fix (and, for
      // reserve, again in the rollover) — the last one is the effective definition.
      expect(definers.length).toBeGreaterThanOrEqual(2);
      expect(definers[definers.length - 1]).toBe(expectedLast[rpc] ?? FIX);
    }
  });

  it("the rollover supersession of reserve keeps it account-keyed (no dropped user_id)", () => {
    const rollover = read("20260620000000_lazy_task_period_rollover.sql").replace(/--[^\n]*/g, "");
    expect(rollover).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.reserve_tasks_if_available\(\s*p_account_id\s+uuid/i);
    expect(rollover).not.toMatch(/\bwr\.user_id\b/i);
    expect(rollover).not.toMatch(/workflow_runs\.user_id/i);
    expect(rollover).toMatch(/wr\.account_id\s*=\s*p_account_id/i);
  });

  it("redefines all four RPCs", () => {
    for (const rpc of RPCS) {
      expect(fixSql).toMatch(
        new RegExp(`CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+public\\.${rpc}\\b`, "i"),
      );
    }
  });

  it("no longer references the dropped workflow_runs.user_id column", () => {
    // The broken originals used `AND user_id = p_user_id` against workflow_runs
    // and `SELECT id, user_id, ... FROM public.workflow_runs`. (Executable SQL
    // only — comments still quote the old pattern for documentation.)
    expect(fixCode).not.toMatch(/AND\s+user_id\s*=\s*p_user_id/i);
    expect(fixCode).not.toMatch(/\bwr\.user_id\b/i);
    expect(fixCode).not.toMatch(/workflow_runs\.user_id/i);
    expect(fixCode).not.toMatch(/SELECT\s+id\s*,\s*user_id/i);
  });

  it("recovers the billed user via the surviving account-owner path", () => {
    // one workflow_runs → accounts join per RPC (4 total).
    const joins =
      fixCode.match(
        /JOIN\s+public\.accounts\s+a\s+ON\s+a\.id\s*=\s*wr\.account_id/gi,
      ) ?? [];
    expect(joins.length).toBe(4);
    expect(fixCode).toMatch(/a\.owner_user_id/i);
    // the sweep locks only the run rows, not the joined accounts rows.
    expect(fixCode).toMatch(/FOR\s+UPDATE\s+OF\s+wr/i);
  });

  it("keeps billing USER-scoped (no account re-key in 9a)", () => {
    // counters still live on user_billing, keyed by user_id.
    expect(fixCode).toMatch(/public\.user_billing/);
    expect(fixCode).not.toMatch(/account_billing/i);
    // signatures unchanged — still p_user_id (Phase C re-keys to p_account_id).
    expect(fixCode).toMatch(/reserve_tasks_if_available\(\s*p_user_id\s+uuid/i);
    expect(fixCode).toMatch(/reconcile_task_reservation\(\s*p_user_id\s+uuid/i);
    expect(fixCode).toMatch(/release_task_reservation\(\s*p_user_id\s+uuid/i);
  });

  it("keeps the RPCs SECURITY DEFINER + service_role-only", () => {
    for (const rpc of RPCS) {
      expect(fixSql).toMatch(
        new RegExp(
          `GRANT\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+public\\.${rpc}[^;]*TO\\s+service_role`,
          "i",
        ),
      );
      expect(fixSql).toMatch(
        new RegExp(
          `REVOKE\\s+ALL\\s+ON\\s+FUNCTION\\s+public\\.${rpc}[^;]*FROM\\s+public,\\s*anon,\\s*authenticated`,
          "i",
        ),
      );
    }
    expect(fixSql).toMatch(/SECURITY\s+DEFINER/i);
  });
});
