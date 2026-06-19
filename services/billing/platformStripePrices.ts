import type { PlanTier, BillingInterval } from "@/core/billing/planPolicy";

/**
 * PLATFORM Stripe price configuration (Slice 4.BILLING-PLAN-METADATA-3 / CS-2; monthly/annual
 * interval support added in PRICING-INTERVAL-1).
 *
 * Maps a (paid plan tier, billing interval) to the env var that holds its Stripe Price id.
 * Prices are resolved from config (never hardcoded ids) so the same code runs against test-
 * and live-mode prices. SERVER-ONLY env reads, lazy (read at call time, not module load).
 *
 * Interval model: `monthly` | `annual`. Each paid tier (pro/team/business) has its own Price
 * id PER interval. The default interval is `monthly`.
 *
 * Backward compatibility: the deprecated single-interval vars `STRIPE_PRICE_PRO` /
 * `STRIPE_PRICE_TEAM` / `STRIPE_PRICE_BUSINESS` are still honored, but ONLY as a fallback for
 * the MONTHLY interval, so an env that predates interval support keeps working. There is NO
 * legacy fallback for annual — annual requires the explicit `_ANNUAL` var. Prefer the
 * interval-specific vars; the legacy vars will be removed once envs are migrated.
 *
 * Tiers WITHOUT a fixed price:
 *   - `free`       — no charge, so no price id.
 *   - `enterprise` — custom / contact-sales; priced per contract, not a fixed Stripe Price.
 *                    `resolvePlanPrice` reports `missing:false` (absence is expected).
 */

/** Interval-specific env var per PAID, fixed-price plan tier (the preferred config). */
export const PLAN_PRICE_ENV_VARS: Readonly<
  Partial<Record<PlanTier, Readonly<Record<BillingInterval, string>>>>
> = {
  pro: { monthly: "STRIPE_PRICE_PRO_MONTHLY", annual: "STRIPE_PRICE_PRO_ANNUAL" },
  team: { monthly: "STRIPE_PRICE_TEAM_MONTHLY", annual: "STRIPE_PRICE_TEAM_ANNUAL" },
  business: { monthly: "STRIPE_PRICE_BUSINESS_MONTHLY", annual: "STRIPE_PRICE_BUSINESS_ANNUAL" },
};

/**
 * DEPRECATED single-interval env vars, honored ONLY as a MONTHLY fallback for backward
 * compatibility. Do not add new tiers here; use the interval-specific map above.
 */
export const LEGACY_MONTHLY_PRICE_ENV_VARS: Readonly<Partial<Record<PlanTier, string>>> = {
  pro: "STRIPE_PRICE_PRO",
  team: "STRIPE_PRICE_TEAM",
  business: "STRIPE_PRICE_BUSINESS",
};

/**
 * The PREFERRED env var name carrying a plan's Stripe Price id for an interval, or `null` for
 * tiers with no fixed price (`free` = no charge; `enterprise` = custom/contact-sales). Does
 * not reflect the legacy monthly fallback — that is resolution-time behavior only.
 */
export function priceEnvVarForPlan(
  plan: PlanTier,
  interval: BillingInterval = "monthly",
): string | null {
  return PLAN_PRICE_ENV_VARS[plan]?.[interval] ?? null;
}

export interface ResolvedPlanPrice {
  plan: PlanTier;
  interval: BillingInterval;
  /**
   * The env var the id was actually read from (the legacy var when it supplied the monthly
   * fallback), or `null` when the tier has no fixed price. On a miss, the preferred var name
   * (so a misconfig points at the var that should be set).
   */
  envVar: string | null;
  /** The resolved Stripe Price id, or null when not configured / not applicable. */
  priceId: string | null;
  /**
   * True only when the tier REQUIRES a fixed price (pro/team/business) for this interval but
   * no env var (interval-specific, or — for monthly — the legacy fallback) is set. `free` and
   * `enterprise` are never `missing` (no fixed price by design).
   */
  missing: boolean;
}

function readEnv(name: string): string | null {
  return process.env[name]?.trim() || null;
}

/**
 * Resolve a plan's Stripe Price id for an interval from env (lazy). Monthly falls back to the
 * deprecated single-interval var; annual does not. Returns a typed result so callers (CS-3
 * checkout) can distinguish "no price by design" (free/enterprise) from "should have a price
 * but it isn't configured yet" (`missing: true`).
 */
export function resolvePlanPrice(
  plan: PlanTier,
  interval: BillingInterval = "monthly",
): ResolvedPlanPrice {
  const preferredVar = priceEnvVarForPlan(plan, interval);
  if (!preferredVar) {
    // free (no charge) or enterprise (custom/contact-sales) — no fixed price expected.
    return { plan, interval, envVar: null, priceId: null, missing: false };
  }
  const preferredId = readEnv(preferredVar);
  if (preferredId) {
    return { plan, interval, envVar: preferredVar, priceId: preferredId, missing: false };
  }
  // Backward-compat: the MONTHLY interval may fall back to the deprecated single-interval var.
  if (interval === "monthly") {
    const legacyVar = LEGACY_MONTHLY_PRICE_ENV_VARS[plan] ?? null;
    const legacyId = legacyVar ? readEnv(legacyVar) : null;
    if (legacyVar && legacyId) {
      return { plan, interval, envVar: legacyVar, priceId: legacyId, missing: false };
    }
  }
  return { plan, interval, envVar: preferredVar, priceId: null, missing: true };
}
