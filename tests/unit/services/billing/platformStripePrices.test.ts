/**
 * @jest-environment node
 *
 * Slice 4.BILLING-PLAN-METADATA-3 / CS-2 + PRICING-INTERVAL-1 — platform Stripe price config.
 *
 * Proves the (plan-tier, interval) → env-var mapping, lazy resolution, the monthly legacy
 * fallback (and that annual has none), clear missing-price handling, and the documented
 * free/enterprise "no fixed price" behavior.
 */

import {
  PLAN_PRICE_ENV_VARS,
  LEGACY_MONTHLY_PRICE_ENV_VARS,
  priceEnvVarForPlan,
  resolvePlanPrice,
} from "@/services/billing/platformStripePrices";
import { PLAN_TIERS, isBillingInterval } from "@/core/billing/planPolicy";

const origEnv = { ...process.env };
afterEach(() => {
  process.env = { ...origEnv };
});

describe("isBillingInterval", () => {
  it("accepts monthly / annual and rejects anything else", () => {
    expect(isBillingInterval("monthly")).toBe(true);
    expect(isBillingInterval("annual")).toBe(true);
    expect(isBillingInterval("weekly")).toBe(false);
    expect(isBillingInterval("")).toBe(false);
  });
});

describe("priceEnvVarForPlan — (tier, interval) → env var mapping", () => {
  it("maps paid tiers to interval-specific env vars", () => {
    expect(priceEnvVarForPlan("pro", "monthly")).toBe("STRIPE_PRICE_PRO_MONTHLY");
    expect(priceEnvVarForPlan("pro", "annual")).toBe("STRIPE_PRICE_PRO_ANNUAL");
    expect(priceEnvVarForPlan("team", "monthly")).toBe("STRIPE_PRICE_TEAM_MONTHLY");
    expect(priceEnvVarForPlan("team", "annual")).toBe("STRIPE_PRICE_TEAM_ANNUAL");
    expect(priceEnvVarForPlan("business", "monthly")).toBe("STRIPE_PRICE_BUSINESS_MONTHLY");
    expect(priceEnvVarForPlan("business", "annual")).toBe("STRIPE_PRICE_BUSINESS_ANNUAL");
  });

  it("defaults to the monthly env var when interval is omitted", () => {
    expect(priceEnvVarForPlan("pro")).toBe("STRIPE_PRICE_PRO_MONTHLY");
  });

  it("returns null for tiers with no fixed price (free, enterprise), both intervals", () => {
    expect(priceEnvVarForPlan("free", "monthly")).toBeNull();
    expect(priceEnvVarForPlan("free", "annual")).toBeNull();
    expect(priceEnvVarForPlan("enterprise", "monthly")).toBeNull();
    expect(priceEnvVarForPlan("enterprise", "annual")).toBeNull();
  });

  it("the env-var maps only contain paid fixed-price tiers", () => {
    expect(Object.keys(PLAN_PRICE_ENV_VARS).sort()).toEqual(["business", "pro", "team"]);
    expect(Object.keys(LEGACY_MONTHLY_PRICE_ENV_VARS).sort()).toEqual(["business", "pro", "team"]);
  });

  it("covers every PlanTier (no tier left unhandled)", () => {
    for (const tier of PLAN_TIERS) {
      const v = priceEnvVarForPlan(tier);
      expect(v === null || typeof v === "string").toBe(true);
    }
  });
});

describe("resolvePlanPrice — interval-specific resolution", () => {
  it("monthly Pro resolves STRIPE_PRICE_PRO_MONTHLY (lazy, trimmed)", () => {
    process.env.STRIPE_PRICE_PRO_MONTHLY = "  price_pro_m  ";
    const r = resolvePlanPrice("pro", "monthly");
    expect(r).toEqual({ plan: "pro", interval: "monthly", envVar: "STRIPE_PRICE_PRO_MONTHLY", priceId: "price_pro_m", missing: false });
  });

  it("annual Pro resolves STRIPE_PRICE_PRO_ANNUAL", () => {
    process.env.STRIPE_PRICE_PRO_ANNUAL = "price_pro_a";
    const r = resolvePlanPrice("pro", "annual");
    expect(r).toMatchObject({ interval: "annual", envVar: "STRIPE_PRICE_PRO_ANNUAL", priceId: "price_pro_a", missing: false });
  });

  it("monthly Team resolves STRIPE_PRICE_TEAM_MONTHLY; annual Team resolves STRIPE_PRICE_TEAM_ANNUAL", () => {
    process.env.STRIPE_PRICE_TEAM_MONTHLY = "price_team_m";
    process.env.STRIPE_PRICE_TEAM_ANNUAL = "price_team_a";
    expect(resolvePlanPrice("team", "monthly").priceId).toBe("price_team_m");
    expect(resolvePlanPrice("team", "annual").priceId).toBe("price_team_a");
  });

  it("monthly Business resolves STRIPE_PRICE_BUSINESS_MONTHLY; annual Business resolves STRIPE_PRICE_BUSINESS_ANNUAL", () => {
    process.env.STRIPE_PRICE_BUSINESS_MONTHLY = "price_biz_m";
    process.env.STRIPE_PRICE_BUSINESS_ANNUAL = "price_biz_a";
    expect(resolvePlanPrice("business", "monthly").priceId).toBe("price_biz_m");
    expect(resolvePlanPrice("business", "annual").priceId).toBe("price_biz_a");
  });

  it("omitted interval defaults to monthly", () => {
    process.env.STRIPE_PRICE_PRO_MONTHLY = "price_pro_default";
    const r = resolvePlanPrice("pro");
    expect(r.interval).toBe("monthly");
    expect(r.priceId).toBe("price_pro_default");
  });

  it("prefers the interval-specific var over the legacy var for monthly", () => {
    process.env.STRIPE_PRICE_PRO_MONTHLY = "price_pro_m_new";
    process.env.STRIPE_PRICE_PRO = "price_pro_legacy";
    const r = resolvePlanPrice("pro", "monthly");
    expect(r.envVar).toBe("STRIPE_PRICE_PRO_MONTHLY");
    expect(r.priceId).toBe("price_pro_m_new");
  });
});

describe("resolvePlanPrice — legacy monthly fallback (backward compat)", () => {
  it("monthly falls back to the deprecated STRIPE_PRICE_PRO when the _MONTHLY var is unset", () => {
    delete process.env.STRIPE_PRICE_PRO_MONTHLY;
    process.env.STRIPE_PRICE_PRO = "price_pro_legacy";
    const r = resolvePlanPrice("pro", "monthly");
    expect(r.priceId).toBe("price_pro_legacy");
    expect(r.envVar).toBe("STRIPE_PRICE_PRO");
    expect(r.missing).toBe(false);
  });

  it("annual has NO legacy fallback — only the legacy var set → missing", () => {
    delete process.env.STRIPE_PRICE_PRO_ANNUAL;
    process.env.STRIPE_PRICE_PRO = "price_pro_legacy";
    const r = resolvePlanPrice("pro", "annual");
    expect(r.priceId).toBeNull();
    expect(r.missing).toBe(true);
    expect(r.envVar).toBe("STRIPE_PRICE_PRO_ANNUAL");
  });
});

describe("resolvePlanPrice — missing / no-price handling", () => {
  it("flags a paid tier with no configured price (interval-specific or legacy) as missing", () => {
    delete process.env.STRIPE_PRICE_TEAM_MONTHLY;
    delete process.env.STRIPE_PRICE_TEAM;
    const r = resolvePlanPrice("team", "monthly");
    expect(r.envVar).toBe("STRIPE_PRICE_TEAM_MONTHLY");
    expect(r.priceId).toBeNull();
    expect(r.missing).toBe(true);
  });

  it("flags a blank price env var as missing", () => {
    process.env.STRIPE_PRICE_BUSINESS_ANNUAL = "   ";
    const r = resolvePlanPrice("business", "annual");
    expect(r.priceId).toBeNull();
    expect(r.missing).toBe(true);
  });

  it("free has no fixed price and is never 'missing' (either interval)", () => {
    expect(resolvePlanPrice("free", "monthly")).toMatchObject({ envVar: null, priceId: null, missing: false });
    expect(resolvePlanPrice("free", "annual")).toMatchObject({ envVar: null, priceId: null, missing: false });
  });

  it("enterprise is custom/contact-sales: no env var, no price, not 'missing' (either interval)", () => {
    expect(resolvePlanPrice("enterprise", "monthly")).toMatchObject({ envVar: null, priceId: null, missing: false });
    expect(resolvePlanPrice("enterprise", "annual")).toMatchObject({ envVar: null, priceId: null, missing: false });
  });
});
