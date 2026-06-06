import type { PlanTier } from "@/core/billing/planPolicy";

/**
 * PLATFORM Stripe price configuration (Slice 4.BILLING-PLAN-METADATA-3 / CS-2).
 *
 * Maps a paid plan tier to the env var that holds its Stripe Price id. Prices are
 * resolved from config (never hardcoded ids) so the same code runs against test- and
 * live-mode prices. SERVER-ONLY env reads, lazy (read at call time, not module load).
 *
 * CS-2 ships the mapping + resolver only — NO checkout session is created here. The
 * single-price-per-tier shape matches the launch decision to defer monthly/annual
 * variants (plan doc §7 + deferred list); when annual lands, this map gains a billing
 * interval dimension.
 *
 * Tiers WITHOUT a fixed price:
 *   - `free`       — no charge, so no price id.
 *   - `enterprise` — custom / contact-sales; priced per contract, not a fixed Stripe
 *                    Price. `priceEnvVarForPlan` returns null and `resolvePlanPrice`
 *                    reports `missing: false` (absence is expected, not a misconfig).
 */

/** Env var name holding the Stripe Price id for each PAID, fixed-price plan tier. */
export const PLAN_PRICE_ENV_VARS: Readonly<Partial<Record<PlanTier, string>>> = {
  pro: "STRIPE_PRICE_PRO",
  team: "STRIPE_PRICE_TEAM",
  business: "STRIPE_PRICE_BUSINESS",
};

/**
 * The env var name carrying a plan's Stripe Price id, or `null` for tiers with no fixed
 * price (`free` = no charge; `enterprise` = custom/contact-sales).
 */
export function priceEnvVarForPlan(plan: PlanTier): string | null {
  return PLAN_PRICE_ENV_VARS[plan] ?? null;
}

export interface ResolvedPlanPrice {
  plan: PlanTier;
  /** The env var consulted, or null when the tier has no fixed price. */
  envVar: string | null;
  /** The resolved Stripe Price id, or null when not configured / not applicable. */
  priceId: string | null;
  /**
   * True only when the tier REQUIRES a fixed price (pro/team/business) but the env var
   * is unset/blank. `free` and `enterprise` are never `missing` (no fixed price by
   * design).
   */
  missing: boolean;
}

/**
 * Resolve a plan's Stripe Price id from env (lazy). Returns a typed result so callers
 * (CS-3 checkout) can distinguish "no price by design" (free/enterprise) from
 * "should have a price but it isn't configured yet" (`missing: true`).
 */
export function resolvePlanPrice(plan: PlanTier): ResolvedPlanPrice {
  const envVar = priceEnvVarForPlan(plan);
  if (!envVar) {
    // free (no charge) or enterprise (custom/contact-sales) — no fixed price expected.
    return { plan, envVar: null, priceId: null, missing: false };
  }
  const priceId = process.env[envVar]?.trim() || null;
  return { plan, envVar, priceId, missing: priceId === null };
}
