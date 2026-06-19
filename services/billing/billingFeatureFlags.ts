/**
 * Billing feature flags (Slice 4.COST-13).
 *
 * Single source for reserve/reconcile rollout gating. There is no existing
 * feature-flag module in V2 (flags are ad-hoc `process.env` reads), so this
 * is the dedicated home for the one flag the reserve/reconcile rollout needs.
 *
 * DEFAULT OFF — live billing stays the flat `deduct_tasks_if_available` path
 * (Slice 1N) until the COST-16 cutover. When this flag is false, the
 * reserve/reconcile service performs NO balance mutations (it returns skipped
 * results). The engine IS wired to the reserve/reconcile lifecycle (COST-15H,
 * services/execution/engine.ts) — this flag is the switch that selects it for
 * live runs, so flipping it ON changes real billing behavior.
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

// Platform billing + Personal Pro are LIVE by default — no feature-flag gate. The earlier
// dark-launch flags (ENABLE_PLATFORM_BILLING / ENABLE_PERSONAL_PRO) were removed once live
// Stripe config, products, and prices shipped. Safety did NOT move into a flag: the route +
// service layers still fail closed when Stripe is unconfigured (503 PLATFORM_BILLING_NOT_CONFIGURED
// / PRICE_NOT_CONFIGURED), still enforce auth + owner/admin role + freeze checks, and still
// validate plan↔account-type server-side. Business → Team downgrade stays flag-gated below
// because it is destructive (removes members, flattens folders) and owner-confirmed.

/**
 * Env var gating the BUSINESS → TEAM downgrade path (Slice 4.PLATFORM-BILLING-BUSINESS-DOWNGRADE-2
 * / CS-BD-1).
 *
 * DEFAULT OFF. Downgrade is **destructive** (removes non-owner members via the existing
 * offboarding sequence and flattens the folder hierarchy to Trash; workflows are kept). It is an
 * explicit, owner-confirmed action — NEVER webhook-driven — and ships dark until deliberately
 * enabled. Read at call time. This is the only remaining billing dark-launch flag (platform
 * billing + Personal Pro are now live by default).
 */
export const BUSINESS_DOWNGRADE_FLAG = "ENABLE_BUSINESS_DOWNGRADE";

/** True only when ENABLE_BUSINESS_DOWNGRADE === "true". Default false. */
export function isBusinessDowngradeEnabled(): boolean {
  return process.env[BUSINESS_DOWNGRADE_FLAG] === "true";
}

/**
 * Env var gating AI CREDIT ENFORCEMENT (Slice 4.AI-CREDITS-3, deduct-only).
 *
 * DEFAULT OFF. When OFF, `aiCreditGate` is a pure no-op (returns
 * `skipped: enforcement_disabled`, no DB write, no charge) — AI credits stay
 * recording-only (AI-CREDITS-2). When ON, paid AI features deduct credits via
 * `deduct_ai_credits_if_available` before the LLM call; 0-credit/deterministic
 * features still pass for free. Read at call time so tests + rollout can toggle it
 * without re-importing. This slice ships the gate + flag but does NOT wire the gate
 * into any live AI route (infra-only).
 */
export const AI_CREDIT_ENFORCEMENT_FLAG = "ENABLE_AI_CREDIT_ENFORCEMENT";

/** True only when ENABLE_AI_CREDIT_ENFORCEMENT === "true". Default false. */
export function isAiCreditEnforcementEnabled(): boolean {
  return process.env[AI_CREDIT_ENFORCEMENT_FLAG] === "true";
}
