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

/**
 * Env var dark-launching the PERSONAL PRO tier (Slice 4.PLATFORM-BILLING-PRO-VALUE-2 / CS-PRO-1).
 *
 * DEFAULT OFF. SEPARATE from ENABLE_PLATFORM_BILLING: the initial billing rollout launches
 * Team/Business while Personal Pro stays dark until it carries real value (see
 * docs/slices/phase-4/account-settings/personal-pro-value-plan.md). When OFF, the personal
 * Free → Pro upgrade affordance is hidden AND the checkout route rejects `plan="pro"` BEFORE
 * any Stripe call — UI hiding alone is not the protection (the route gate is). Has no effect
 * unless ENABLE_PLATFORM_BILLING is also ON. Read at call time. Does NOT touch Team/Business.
 */
export const PERSONAL_PRO_FLAG = "ENABLE_PERSONAL_PRO";

/** True only when ENABLE_PERSONAL_PRO === "true". Default false. */
export function isPersonalProEnabled(): boolean {
  return process.env[PERSONAL_PRO_FLAG] === "true";
}

/**
 * Env var gating the BUSINESS → TEAM downgrade path (Slice 4.PLATFORM-BILLING-BUSINESS-DOWNGRADE-2
 * / CS-BD-1).
 *
 * DEFAULT OFF. Downgrade is **destructive** (removes non-owner members via the existing
 * offboarding sequence and flattens the folder hierarchy to Trash; workflows are kept). It is an
 * explicit, owner-confirmed action — NEVER webhook-driven — and ships dark until deliberately
 * enabled (and only meaningful when ENABLE_PLATFORM_BILLING is also on). Read at call time.
 * Separate from Personal Pro + platform billing flags.
 */
export const BUSINESS_DOWNGRADE_FLAG = "ENABLE_BUSINESS_DOWNGRADE";

/** True only when ENABLE_BUSINESS_DOWNGRADE === "true". Default false. */
export function isBusinessDowngradeEnabled(): boolean {
  return process.env[BUSINESS_DOWNGRADE_FLAG] === "true";
}
