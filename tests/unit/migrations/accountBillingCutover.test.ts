/**
 * @jest-environment node
 *
 * Static guard for the account billing cutover + canonical cleanup
 * (4.ACCOUNT-MODEL-9c live cutover, 9c2 canonical cleanup). Reads production
 * billing sources + the cleanup migration (no DB) so CI proves, on every run,
 * that there is ONE canonical billing path (account_billing) and the user-scoped
 * path is gone:
 *   - the production billing callers import accountBilling (not userBilling),
 *     reference account_billing, key on p_account_id, and contain NO user_billing
 *     / p_user_id / `_v2` reference;
 *   - the engine threads workflow.accountId into the billing gate / reserve /
 *     reconcile, while keeping createdByUserId for the still-user-scoped LEDGERS
 *     (task_usage_events / billing_shadow_comparisons, rescoped in 9d) — proving
 *     provenance is NOT a billing key;
 *   - 9c2 drops user_billing, promotes the `_v2` RPCs to canonical names, and
 *     handle_new_user seeds account_billing only;
 *   - repositories/userBilling.ts no longer exists.
 *
 * Behavioral proof (charge lands on account_billing) is the gated DB harnesses
 * reserveReconcileEngine.dev.test.ts + accountBillingFoundation.dev.test.ts.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();

function readSrc(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8");
}
/** Strip line + block comments so assertions only see executable code. */
function stripComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

const CANONICAL_RPCS = [
  "deduct_tasks_if_available",
  "reserve_tasks_if_available",
  "reconcile_task_reservation",
  "release_task_reservation",
  "release_expired_reservations",
] as const;

const BILLING_CALLERS = [
  "repositories/accountBilling.ts",
  "services/billing/executionBillingGate.ts",
  "services/billing/reserveReconcileBilling.ts",
  "services/billing/workflowCostPreview.ts",
] as const;

describe("4.ACCOUNT-MODEL-9c/9c2 — canonical account billing path (static guards)", () => {
  describe("no production billing caller references user-scoped billing", () => {
    for (const rel of BILLING_CALLERS) {
      it(`${rel} does not import userBilling, hit user_billing, or key on p_user_id`, () => {
        const code = stripComments(readSrc(rel));
        expect(code).not.toMatch(/@\/repositories\/userBilling/);
        expect(code).not.toMatch(/\buser_billing\b/);
        expect(code).not.toMatch(/p_user_id/);
      });
    }
  });

  describe("production billing callers use the canonical account path", () => {
    it("accountBilling repo reads account_billing + calls the canonical RPCs with p_account_id (no _v2)", () => {
      const code = stripComments(readSrc("repositories/accountBilling.ts"));
      expect(code).toMatch(/account_billing/);
      expect(code).not.toMatch(/_v2/);
      expect(code).toMatch(/p_account_id/);
      for (const rpc of CANONICAL_RPCS) {
        expect(code).toMatch(new RegExp(`rpc\\("${rpc}"`));
      }
    });

    it("the gate / reserve / preview services import accountBilling", () => {
      for (const rel of [
        "services/billing/executionBillingGate.ts",
        "services/billing/reserveReconcileBilling.ts",
        "services/billing/workflowCostPreview.ts",
      ]) {
        expect(readSrc(rel)).toMatch(/@\/repositories\/accountBilling/);
      }
    });
  });

  describe("engine threads the account as the billing key, not the actor", () => {
    const code = stripComments(readSrc("services/execution/engine.ts"));

    it("flat gate is called with workflow.accountId (never createdByUserId)", () => {
      expect(code).toMatch(/executionBillingGate\(\s*workflow\.accountId/);
      expect(code).not.toMatch(/executionBillingGate\(\s*workflow\.createdByUserId/);
    });

    it("reserve + reconcile receive accountId: workflow.accountId", () => {
      const matches = code.match(/accountId:\s*workflow\.accountId/g) ?? [];
      expect(matches.length).toBeGreaterThanOrEqual(2);
    });

    it("the ledger recorders are account-scoped too (4.ACCOUNT-MODEL-9d)", () => {
      // recordRunActuals (task_usage_events) + recordShadowComparison
      // (billing_shadow_comparisons) were rescoped to account_id in 9d, so the
      // engine threads accountId (not createdByUserId) into the ledger writes.
      // (createdByUserId legitimately still flows to HANDLERS as the actor and
      // to failure notifications as provenance — not asserted against here.)
      expect(code).toMatch(/recordRunActuals\(\{[\s\S]*?accountId:\s*workflow\.accountId/);
      expect(code).toMatch(/recordShadowComparison\(\{\s*accountId:\s*workflow\.accountId/);
      expect(code).not.toMatch(/recordRunActuals\(\{[\s\S]*?userId:\s*workflow\.createdByUserId/);
    });
  });

  describe("9c2 canonical cleanup: the user-scoped billing path is gone", () => {
    const sql = readSrc("supabase/migrations/20260531000004_account_billing_canonical_cleanup.sql");

    it("drops the user_billing table", () => {
      expect(sql).toMatch(/DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?public\.user_billing/i);
    });

    it("drops the user-keyed RPCs and promotes the _v2 RPCs to canonical names", () => {
      for (const rpc of CANONICAL_RPCS) {
        expect(sql).toMatch(
          new RegExp(`ALTER\\s+FUNCTION\\s+public\\.${rpc}_v2\\([^)]*\\)\\s+RENAME\\s+TO\\s+${rpc}`, "i"),
        );
      }
    });

    it("handle_new_user seeds account_billing and NOT user_billing", () => {
      expect(sql).toMatch(/INSERT\s+INTO\s+public\.account_billing\s*\(account_id\)/i);
      const fnStart = sql.indexOf("CREATE OR REPLACE FUNCTION public.handle_new_user");
      const fnBody = sql.slice(fnStart, sql.indexOf("$$;", fnStart));
      expect(fnStart).toBeGreaterThanOrEqual(0);
      expect(fnBody).not.toMatch(/INSERT\s+INTO\s+public\.user_billing/i);
    });

    it("repositories/userBilling.ts no longer exists", () => {
      expect(existsSync(resolve(ROOT, "repositories/userBilling.ts"))).toBe(false);
    });
  });
});
