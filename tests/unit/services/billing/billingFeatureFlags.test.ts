/**
 * @jest-environment node
 *
 * Billing feature-flag accessors. Covers the ENABLE_BUSINESS_DOWNGRADE dark-launch flag:
 * default OFF, true ONLY when the env var is exactly "true" (not "1"/"TRUE"/"yes"), read at
 * call time.
 *
 * NOTE: ENABLE_PLATFORM_BILLING and ENABLE_PERSONAL_PRO were REMOVED — platform billing and
 * Personal Pro are live by default (no flag gate). The launch safety did not move into a flag:
 * the route/service layer still enforces auth + owner/admin role + freeze checks, fails closed
 * when Stripe is unconfigured (503), and validates plan↔account-type server-side. Business →
 * Team downgrade stays flag-gated because it is destructive.
 */
import {
  BUSINESS_DOWNGRADE_FLAG,
  isBusinessDowngradeEnabled,
} from "@/services/billing/billingFeatureFlags";

const ORIGINAL_BD = process.env[BUSINESS_DOWNGRADE_FLAG];

afterEach(() => {
  if (ORIGINAL_BD === undefined) delete process.env[BUSINESS_DOWNGRADE_FLAG];
  else process.env[BUSINESS_DOWNGRADE_FLAG] = ORIGINAL_BD;
});

describe("isBusinessDowngradeEnabled", () => {
  it("defaults to false when unset", () => {
    delete process.env[BUSINESS_DOWNGRADE_FLAG];
    expect(isBusinessDowngradeEnabled()).toBe(false);
  });

  it("is true only when the env var is exactly 'true'", () => {
    process.env[BUSINESS_DOWNGRADE_FLAG] = "true";
    expect(isBusinessDowngradeEnabled()).toBe(true);
  });

  it.each(["1", "TRUE", "yes", "", "false"])("is false for non-canonical value %p", (val) => {
    process.env[BUSINESS_DOWNGRADE_FLAG] = val;
    expect(isBusinessDowngradeEnabled()).toBe(false);
  });

  it("is read at call time (toggle without re-import)", () => {
    process.env[BUSINESS_DOWNGRADE_FLAG] = "true";
    expect(isBusinessDowngradeEnabled()).toBe(true);
    process.env[BUSINESS_DOWNGRADE_FLAG] = "false";
    expect(isBusinessDowngradeEnabled()).toBe(false);
  });
});
