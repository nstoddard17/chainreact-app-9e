/**
 * @jest-environment node
 *
 * Static cutover guard for 4.ACCOUNT-MODEL-9c. Reads production billing sources
 * (no DB) so CI proves, on every run, that LIVE billing is account-scoped and no
 * stale user-scoped caller remains:
 *   - the production billing callers import accountBilling (not userBilling),
 *     reference account_billing + the `_v2` RPCs, and contain NO user_billing /
 *     user-keyed RPC reference;
 *   - the engine threads workflow.accountId (not createdByUserId) into the
 *     billing gate / reserve / reconcile, while keeping createdByUserId for the
 *     still-user-scoped LEDGERS (task_usage_events / billing_shadow_comparisons,
 *     rescoped in 9d) — proving provenance is NOT a billing key;
 *   - handle_new_user dual-seeds account_billing (and still seeds user_billing
 *     for the deprecation window).
 *
 * Behavioral proof (charge lands on account_billing) is the gated DB harness
 * reserveReconcileEngine.dev.test.ts.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();

function readSrc(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8");
}
/** Strip line + block comments so assertions only see executable code. */
function stripComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

const USER_KEYED_RPCS = [
  "deduct_tasks_if_available",
  "reserve_tasks_if_available",
  "reconcile_task_reservation",
  "release_task_reservation",
  "release_expired_reservations",
] as const;

// The production billing callers repointed in 9c.
const BILLING_CALLERS = [
  "repositories/accountBilling.ts",
  "services/billing/executionBillingGate.ts",
  "services/billing/reserveReconcileBilling.ts",
  "services/billing/workflowCostPreview.ts",
] as const;

describe("4.ACCOUNT-MODEL-9c — account billing live cutover (static guards)", () => {
  describe("no production billing caller references user-scoped billing", () => {
    for (const rel of BILLING_CALLERS) {
      it(`${rel} does not import userBilling, hit user_billing, or call a user-keyed RPC`, () => {
        const code = stripComments(readSrc(rel));
        expect(code).not.toMatch(/@\/repositories\/userBilling/);
        expect(code).not.toMatch(/\buser_billing\b/);
        for (const rpc of USER_KEYED_RPCS) {
          // user-keyed name = the bare name NOT followed by _v2.
          expect(code).not.toMatch(new RegExp(`${rpc}(?!_v2)`));
        }
      });
    }
  });

  describe("production billing callers use the account path", () => {
    it("accountBilling repo reads account_billing + calls all five _v2 RPCs", () => {
      const code = stripComments(readSrc("repositories/accountBilling.ts"));
      expect(code).toMatch(/account_billing/);
      for (const rpc of USER_KEYED_RPCS) {
        expect(code).toMatch(new RegExp(`${rpc}_v2`));
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
    const engine = readSrc("services/execution/engine.ts");
    const code = stripComments(engine);

    it("flat gate is called with workflow.accountId (never createdByUserId)", () => {
      expect(code).toMatch(/executionBillingGate\(\s*workflow\.accountId/);
      expect(code).not.toMatch(/executionBillingGate\(\s*workflow\.createdByUserId/);
    });

    it("reserve + reconcile receive accountId: workflow.accountId", () => {
      const matches = code.match(/accountId:\s*workflow\.accountId/g) ?? [];
      // createBillingReservation + reconcileBillingReservation.
      expect(matches.length).toBeGreaterThanOrEqual(2);
    });

    it("the user-scoped ledgers still receive createdByUserId (provenance, not a billing key)", () => {
      // recordRunActuals (task_usage_events) + recordShadowComparison
      // (billing_shadow_comparisons) stay user-scoped until 9d.
      const matches = code.match(/userId:\s*workflow\.createdByUserId/g) ?? [];
      expect(matches.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("handle_new_user dual-seeds account_billing", () => {
    const sql = readFileSync(
      resolve(ROOT, "supabase/migrations/20260531000003_handle_new_user_account_billing.sql"),
      "utf8",
    );
    it("inserts account_billing for the new personal account", () => {
      expect(sql).toMatch(/INSERT\s+INTO\s+public\.account_billing\s*\(account_id\)/i);
    });
    it("still seeds user_billing during the deprecation window", () => {
      expect(sql).toMatch(/INSERT\s+INTO\s+public\.user_billing/i);
    });
  });
});
