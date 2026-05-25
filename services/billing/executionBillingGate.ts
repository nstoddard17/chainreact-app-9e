import * as userBillingRepo from "@/repositories/userBilling";

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
 * Returns a discriminated outcome:
 *   ok=true                  → run may proceed (task deducted).
 *   ok=true (skipped)        → run may proceed; deduction skipped (test mode).
 *   ok=false (limit_reached) → run refused; engine surfaces BILLING_EXHAUSTED.
 */

export type BillingGateOutcome =
  | { ok: true; used: number; limit: number }
  | { ok: true; skipped: true; reason: "test_mode" }
  | { ok: false; reason: "limit_reached"; used: number; limit: number };

export interface ExecutionBillingGateOptions {
  /**
   * COST-2A — when true, the run is a test / dry-run execution and the
   * gate skips deduction entirely. Default false (real execution → bill).
   */
  testMode?: boolean;
}

export async function executionBillingGate(
  userId: string,
  options: ExecutionBillingGateOptions = {},
): Promise<BillingGateOutcome> {
  // COST-2A — test/dry-run runs do not bill. Return before touching the
  // repository so no quota is consumed and no DB round-trip happens.
  if (options.testMode === true) {
    return { ok: true, skipped: true, reason: "test_mode" };
  }

  const result = await userBillingRepo.deductTasks(userId, 1);
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
