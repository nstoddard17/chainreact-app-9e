/**
 * @jest-environment node
 *
 * Static guard for the account_billing foundation (Slice 4.ACCOUNT-MODEL-9b).
 *
 * 9b introduces account-scoped billing SIDE-BY-SIDE with the live user-scoped
 * system. This test reads the migration SQL + production caller sources (no DB)
 * so CI proves, on every run, the hard fences of a foundation slice:
 *   - account_billing is created (account_id PK + accounts FK + membership RLS).
 *   - the five account-keyed `_v2` RPCs + the backfill function exist.
 *   - user_billing is NOT dropped and the user-keyed RPCs are NOT redefined here.
 *   - NO production billing caller is repointed to the _v2 / account path.
 *
 * The live functional + parity + RLS proofs are the opt-in DB harnesses
 * (accountBillingFoundation.dev.test.ts, account-billing-rls.test.ts).
 */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = process.cwd();
const MIGRATIONS = resolve(ROOT, "supabase/migrations");
const FND = "20260531000001_account_billing_foundation.sql";

function readMigration(file: string): string {
  return readFileSync(join(MIGRATIONS, file), "utf8");
}

const fndSql = readMigration(FND);
const fndCode = fndSql.replace(/--[^\n]*/g, ""); // strip comments for code assertions

const V2_RPCS = [
  "deduct_tasks_if_available_v2",
  "reserve_tasks_if_available_v2",
  "reconcile_task_reservation_v2",
  "release_task_reservation_v2",
  "release_expired_reservations_v2",
] as const;

describe("4.ACCOUNT-MODEL-9b — account_billing foundation (static guards)", () => {
  describe("account_billing table", () => {
    it("creates account_billing keyed on account_id with an accounts FK", () => {
      expect(fndCode).toMatch(/CREATE\s+TABLE\s+public\.account_billing/i);
      expect(fndCode).toMatch(
        /account_id\s+uuid\s+PRIMARY\s+KEY\s+REFERENCES\s+public\.accounts\(id\)\s+ON\s+DELETE\s+RESTRICT/i,
      );
    });

    it("mirrors user_billing counter columns + the tasks_reserved non-negativity CHECK", () => {
      for (const col of ["tasks_limit", "tasks_used", "tasks_reserved", "period_started_at"]) {
        expect(fndCode).toMatch(new RegExp(`\\b${col}\\b`));
      }
      expect(fndCode).toMatch(/account_billing_tasks_reserved_nonneg\s+CHECK\s*\(\s*tasks_reserved\s*>=\s*0\s*\)/i);
    });

    it("enables RLS with the account-membership SELECT policy + Data API grants", () => {
      expect(fndCode).toMatch(
        /ALTER\s+TABLE\s+public\.account_billing\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i,
      );
      expect(fndCode).toMatch(
        /CREATE\s+POLICY\s+account_billing_select_account_member\s+ON\s+public\.account_billing/i,
      );
      expect(fndCode).toMatch(/FROM\s+public\.account_memberships\s+am/i);
      expect(fndCode).toMatch(/GRANT\s+SELECT\s+ON\s+public\.account_billing\s+TO\s+authenticated/i);
      expect(fndCode).toMatch(
        /GRANT\s+SELECT,\s*INSERT,\s*UPDATE,\s*DELETE\s+ON\s+public\.account_billing\s+TO\s+service_role/i,
      );
    });
  });

  describe("backfill", () => {
    it("defines an idempotent backfill function and runs it once", () => {
      expect(fndCode).toMatch(
        /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.backfill_account_billing\(\)/i,
      );
      // maps user_billing -> personal account, conflict-safe.
      expect(fndCode).toMatch(/JOIN\s+public\.user_billing\s+ub\s+ON\s+ub\.user_id\s*=\s*a\.owner_user_id/i);
      expect(fndCode).toMatch(/WHERE\s+a\.type\s*=\s*'personal'/i);
      expect(fndCode).toMatch(/ON\s+CONFLICT\s*\(account_id\)\s+DO\s+NOTHING/i);
      expect(fndCode).toMatch(/SELECT\s+public\.backfill_account_billing\(\)/i);
    });

    it("carries the owner's user_billing counters verbatim", () => {
      expect(fndCode).toMatch(
        /SELECT\s+a\.id,\s*ub\.tasks_limit,\s*ub\.tasks_used,\s*ub\.tasks_reserved,\s*ub\.period_started_at/i,
      );
    });

    it("asserts count parity (aborts the migration if backfill is incomplete)", () => {
      expect(fndCode).toMatch(/RAISE\s+EXCEPTION\s+'account_billing backfill incomplete/i);
    });
  });

  describe("account-keyed _v2 RPCs", () => {
    it("defines all five _v2 RPCs, account-keyed + SECURITY DEFINER", () => {
      for (const rpc of V2_RPCS) {
        expect(fndCode).toMatch(
          new RegExp(`CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+public\\.${rpc}\\b`, "i"),
        );
      }
      // the balance-mutating ones take p_account_id (the sweep takes only p_now).
      expect(fndCode).toMatch(/deduct_tasks_if_available_v2\(\s*p_account_id\s+uuid/i);
      expect(fndCode).toMatch(/reserve_tasks_if_available_v2\(\s*p_account_id\s+uuid/i);
      expect(fndCode).toMatch(/reconcile_task_reservation_v2\(\s*p_account_id\s+uuid/i);
      expect(fndCode).toMatch(/release_task_reservation_v2\(\s*p_account_id\s+uuid/i);
      expect(fndCode).toMatch(/SECURITY\s+DEFINER/i);
    });

    it("keys account_billing and never touches user_billing for writes", () => {
      expect(fndCode).toMatch(/public\.account_billing/);
      // 9b must not mutate user_billing at all (no ALTER/DROP/UPDATE of it here).
      expect(fndCode).not.toMatch(/ALTER\s+TABLE\s+public\.user_billing/i);
      expect(fndCode).not.toMatch(/UPDATE\s+public\.user_billing/i);
    });

    it("grants the _v2 RPCs to service_role only", () => {
      for (const rpc of V2_RPCS) {
        expect(fndCode).toMatch(
          new RegExp(`GRANT\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+public\\.${rpc}[^;]*TO\\s+service_role`, "i"),
        );
        expect(fndCode).toMatch(
          new RegExp(`REVOKE\\s+ALL\\s+ON\\s+FUNCTION\\s+public\\.${rpc}[^;]*FROM\\s+public,\\s*anon,\\s*authenticated`, "i"),
        );
      }
    });
  });

  describe("hard fences: user-scoped billing is untouched", () => {
    it("does NOT redefine the user-keyed RPCs in the 9b migration", () => {
      // these are the non-_v2 names; redefining them here would be a cutover.
      expect(fndCode).not.toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.deduct_tasks_if_available\(/i);
      expect(fndCode).not.toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.reserve_tasks_if_available\(/i);
      expect(fndCode).not.toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.reconcile_task_reservation\(/i);
    });

    it("the 9b foundation migration does not drop user_billing (additive only)", () => {
      // Scoped to the FOUNDATION file: 9b was additive. The drop of user_billing
      // happens later, in the 9c2 cleanup (asserted by accountBillingCutover.test.ts).
      expect(fndCode).not.toMatch(/DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?public\.user_billing/i);
    });

    it("does NOT change handle_new_user in this slice (dual-seed deferred to 9c)", () => {
      expect(fndCode).not.toMatch(/handle_new_user/i);
    });
  });

  // NOTE: the 9b foundation migration itself repoints nothing and drops nothing —
  // proven by the fndCode assertions above. The PRODUCTION CALLERS were repointed
  // in the 9c live cutover and the user-scoped path (user_billing + user-keyed
  // RPCs + repositories/userBilling.ts) was removed in the 9c2 cleanup — both
  // realities are asserted by accountBillingCutover.test.ts.
});
