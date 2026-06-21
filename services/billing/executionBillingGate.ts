import * as accountBillingRepo from "@/repositories/accountBilling";
import { isAccountFrozen } from "@/services/accounts/accountFreeze";

/**
 * Pre-execution billing gate.
 *
 * Per docs/rules/project-structure-and-module-boundaries.md §"Single
 * source of truth", the canonical owner of the gate is
 * core/billing/executionBillingGate.ts + the deduct_tasks_if_available
 * RPC. The gate lives in services/ instead because core/'s ESLint guard
 * restricts imports to contracts/ — and the gate fundamentally needs the
 * userBilling repository. Same precedent as services/triggers/dispatch.ts
 * (Slice 1J.3): rule-doc table puts it in core/, ESLint structurally
 * cannot, services/ is the lint-clean home. Behavior is the rule's spec.
 *
 * Slice 1N: 1 task per run, flat. Per-node pricing comes later.
 *
 * Slice 4.COST-2A: test / dry-run executions never consume user tasks.
 * When called with `{ testMode: true }` the gate skips deduction entirely
 * — no DB write, no quota consumed, never refused. The engine's test-mode
 * gate (`decideTestModeBlock`) already short-circuits real external side
 * effects in test runs, so a test run performs no billable work and must
 * not be charged. This is a narrow safety fix; the full per-node /
 * reserve-reconcile model is COST-2/COST-3 (see
 * docs/slices/phase-4/task-cost-billing-model-audit.md §5, §11).
 *
 * Slice 4.BILLING-INTERNAL-ENTITLEMENT-1: an account explicitly marked
 * `billing_mode = 'internal_free'` (internal / test / employee / demo) skips
 * deduction entirely — allowed and non-billable, never refused for quota. This
 * is ACCOUNT-scoped (read off the workflow-owning account's billing row), never
 * a per-user bypass, and is checked AFTER the freeze guard (a frozen account is
 * still refused) and AFTER the test-mode skip (already free, no DB read needed).
 *
 * Returns a discriminated outcome:
 *   ok=true                  → run may proceed (task deducted).
 *   ok=true (skipped)        → run may proceed; deduction skipped (test mode /
 *                              internal_free account).
 *   ok=false (limit_reached) → run refused; engine surfaces BILLING_EXHAUSTED.
 */

export type BillingGateOutcome =
  | { ok: true; used: number; limit: number }
  | { ok: true; skipped: true; reason: "test_mode" | "internal_free" }
  | { ok: false; reason: "limit_reached"; used: number; limit: number }
  | { ok: false; reason: "account_frozen"; used: number; limit: number };

export interface ExecutionBillingGateOptions {
  /**
   * COST-2A — when true, the run is a test / dry-run execution and the
   * gate skips deduction entirely. Default false (real execution → bill).
   */
  testMode?: boolean;
}

export async function executionBillingGate(
  accountId: string,
  options: ExecutionBillingGateOptions = {},
): Promise<BillingGateOutcome> {
  // 4.ACCOUNT-MODEL-10b — account freeze. Checked FIRST, before the test-mode
  // short-circuit: a pending_deletion account is non-operational, so even a
  // test run is refused. This is the universal execution chokepoint — every
  // run (manual / webhook / scheduled / polling) passes through here before any
  // node executes, and the engine treats any `!ok` outcome as a refusal.
  if (await isAccountFrozen(accountId)) {
    return { ok: false, reason: "account_frozen", used: 0, limit: 0 };
  }

  // COST-2A — test/dry-run runs do not bill. Return before touching the
  // repository so no quota is consumed and no DB round-trip happens.
  if (options.testMode === true) {
    return { ok: true, skipped: true, reason: "test_mode" };
  }

  // BIE-1 — internal/test/employee accounts (billing_mode='internal_free') bypass
  // the deduction gate: allowed + non-billable, never refused for quota. Read off
  // the workflow-owning account's billing row (account-scoped, not user-scoped).
  // Checked before deduction so the deduct RPC is never called for these accounts.
  if ((await accountBillingRepo.getBillingModeServiceRole(accountId)) === "internal_free") {
    return { ok: true, skipped: true, reason: "internal_free" };
  }

  // 4.ACCOUNT-MODEL-9c: bill the account that owns the workflow being run,
  // never the actor. The caller passes workflow.accountId.
  const result = await accountBillingRepo.deductTasks(accountId, 1);
  if (result.ok) {
    return { ok: true, used: result.used, limit: result.limit };
  }
  return {
    ok: false,
    reason: "limit_reached",
    used: result.used,
    limit: result.limit,
  };
}
