/**
 * @jest-environment node
 *
 * Slice 4.BILLING-PLAN-METADATA-3 / CS-2 — platform Stripe price config.
 *
 * Proves the plan-tier → env-var mapping, lazy resolution, clear missing-price handling,
 * and the documented free/enterprise "no fixed price" behavior.
 */

import {
  PLAN_PRICE_ENV_VARS,
  priceEnvVarForPlan,
  resolvePlanPrice,
} from "@/services/billing/platformStripePrices";
import { PLAN_TIERS } from "@/core/billing/planPolicy";

const origEnv = { ...process.env };
afterEach(() => {
  process.env = { ...origEnv };
});

describe("priceEnvVarForPlan — tier → env var mapping", () => {
  it("maps paid, fixed-price tiers to their expected env var names", () => {
    expect(priceEnvVarForPlan("pro")).toBe("STRIPE_PRICE_PRO");
    expect(priceEnvVarForPlan("team")).toBe("STRIPE_PRICE_TEAM");
    expect(priceEnvVarForPlan("business")).toBe("STRIPE_PRICE_BUSINESS");
  });

  it("returns null for tiers with no fixed price (free, enterprise)", () => {
    expect(priceEnvVarForPlan("free")).toBeNull();
    expect(priceEnvVarForPlan("enterprise")).toBeNull();
  });

  it("the env-var map only contains paid fixed-price tiers", () => {
    expect(Object.keys(PLAN_PRICE_ENV_VARS).sort()).toEqual(["business", "pro", "team"]);
  });

  it("covers every PlanTier (no tier left unhandled)", () => {
    for (const tier of PLAN_TIERS) {
      // either a string env var or an explicit null — never undefined/throw.
      expect([typeof priceEnvVarForPlan(tier)]).toEqual([
        priceEnvVarForPlan(tier) === null ? "object" : "string",
      ]);
    }
  });
});

describe("resolvePlanPrice — env resolution", () => {
  it("resolves a configured price id (lazy, trimmed)", () => {
    process.env.STRIPE_PRICE_PRO = "  price_pro_123  ";
    const r = resolvePlanPrice("pro");
    expect(r).toEqual({
      plan: "pro",
      envVar: "STRIPE_PRICE_PRO",
      priceId: "price_pro_123",
      missing: false,
    });
  });

  it("flags a paid tier with an UNSET price env var as missing", () => {
    delete process.env.STRIPE_PRICE_TEAM;
    const r = resolvePlanPrice("team");
    expect(r.envVar).toBe("STRIPE_PRICE_TEAM");
    expect(r.priceId).toBeNull();
    expect(r.missing).toBe(true);
  });

  it("flags a blank price env var as missing", () => {
    process.env.STRIPE_PRICE_BUSINESS = "   ";
    const r = resolvePlanPrice("business");
    expect(r.priceId).toBeNull();
    expect(r.missing).toBe(true);
  });

  it("free has no fixed price and is never 'missing'", () => {
    const r = resolvePlanPrice("free");
    expect(r.envVar).toBeNull();
    expect(r.priceId).toBeNull();
    expect(r.missing).toBe(false);
  });

  it("enterprise is custom/contact-sales: no env var, no price, not 'missing'", () => {
    const r = resolvePlanPrice("enterprise");
    expect(r.envVar).toBeNull();
    expect(r.priceId).toBeNull();
    expect(r.missing).toBe(false);
  });
});
