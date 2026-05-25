/**
 * Billing feature flags (Slice 4.COST-13).
 *
 * Single source for reserve/reconcile rollout gating. There is no existing
 * feature-flag module in V2 (flags are ad-hoc `process.env` reads), so this
 * is the dedicated home for the one flag the reserve/reconcile rollout needs.
 *
 * DEFAULT OFF — live billing stays the flat `deduct_tasks_if_available` path
 * (Slice 1N) until the COST-16 cutover. When this flag is false, the
 * reserve/reconcile service performs NO balance mutations (it returns
 * skipped results); the engine is not wired to it at all yet (COST-14).
 *
 * Read at call time (not module load) so tests + future rollout can toggle it
 * without re-importing.
 */

/** Env var name for the reserve/reconcile rollout flag. */
export const RESERVE_RECONCILE_FLAG = "ENABLE_RESERVE_RECONCILE_BILLING";

/** True only when ENABLE_RESERVE_RECONCILE_BILLING === "true". Default false. */
export function isReserveReconcileEnabled(): boolean {
  return process.env[RESERVE_RECONCILE_FLAG] === "true";
}
