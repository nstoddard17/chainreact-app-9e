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

/** Env var name for the reserve/reconcile LIVE rollout flag (balance-mutating). */
export const RESERVE_RECONCILE_FLAG = "ENABLE_RESERVE_RECONCILE_BILLING";

/** True only when ENABLE_RESERVE_RECONCILE_BILLING === "true". Default false. */
export function isReserveReconcileEnabled(): boolean {
  return process.env[RESERVE_RECONCILE_FLAG] === "true";
}

/**
 * Env var name for the reserve/reconcile SHADOW flag (COST-14).
 *
 * SEPARATE from the live flag above. Shadow mode only computes + LOGS a
 * comparison of flat-vs-proposed billing; it NEVER mutates balances and never
 * calls the reserve/reconcile RPCs. Default off → zero behavior change.
 */
export const RESERVE_RECONCILE_SHADOW_FLAG = "ENABLE_RESERVE_RECONCILE_SHADOW";

/** True only when ENABLE_RESERVE_RECONCILE_SHADOW === "true". Default false. */
export function isReserveReconcileShadowEnabled(): boolean {
  return process.env[RESERVE_RECONCILE_SHADOW_FLAG] === "true";
}

/**
 * Env var gating PLATFORM Stripe billing (Slice 4.BILLING-PLAN-METADATA / CS-1).
 *
 * DEFAULT OFF. CS-1 wires NOTHING to this flag — it only ships plan METADATA + the
 * central plan policy (no Stripe, checkout, portal, webhook, or payment behavior).
 * The flag exists so the later payment slices (CS-3+ checkout / portal / webhook /
 * lifecycle) gate their user-facing surfaces behind it. Read at call time. Separate
 * from the WORKFLOW Stripe provider (integrations/stripe/).
 */
export const PLATFORM_BILLING_FLAG = "ENABLE_PLATFORM_BILLING";

/** True only when ENABLE_PLATFORM_BILLING === "true". Default false. */
export function isPlatformBillingEnabled(): boolean {
  return process.env[PLATFORM_BILLING_FLAG] === "true";
}
