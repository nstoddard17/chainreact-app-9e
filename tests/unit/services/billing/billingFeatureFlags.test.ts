/**
 * @jest-environment node
 *
 * Billing feature-flag accessors. Covers the CS-PRO-1 `ENABLE_PERSONAL_PRO` dark-launch flag
 * (and the existing `ENABLE_PLATFORM_BILLING` for parity): default OFF, true ONLY when the env
 * var is exactly "true" (not "1"/"TRUE"/"yes"), read at call time.
 */
import {
  PERSONAL_PRO_FLAG,
  PLATFORM_BILLING_FLAG,
  BUSINESS_DOWNGRADE_FLAG,
  isPersonalProEnabled,
  isPlatformBillingEnabled,
  isBusinessDowngradeEnabled,
} from "@/services/billing/billingFeatureFlags";

const ORIGINAL = process.env[PERSONAL_PRO_FLAG];
const ORIGINAL_PB = process.env[PLATFORM_BILLING_FLAG];
const ORIGINAL_BD = process.env[BUSINESS_DOWNGRADE_FLAG];

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env[PERSONAL_PRO_FLAG];
  else process.env[PERSONAL_PRO_FLAG] = ORIGINAL;
  if (ORIGINAL_PB === undefined) delete process.env[PLATFORM_BILLING_FLAG];
  else process.env[PLATFORM_BILLING_FLAG] = ORIGINAL_PB;
  if (ORIGINAL_BD === undefined) delete process.env[BUSINESS_DOWNGRADE_FLAG];
  else process.env[BUSINESS_DOWNGRADE_FLAG] = ORIGINAL_BD;
});

describe("isPersonalProEnabled", () => {
  it("defaults to false when unset", () => {
    delete process.env[PERSONAL_PRO_FLAG];
    expect(isPersonalProEnabled()).toBe(false);
  });

  it("is true only when the env var is exactly 'true'", () => {
    process.env[PERSONAL_PRO_FLAG] = "true";
    expect(isPersonalProEnabled()).toBe(true);
  });

  it.each(["1", "TRUE", "True", "yes", "on", "", "false"])(
    "is false for non-canonical value %p",
    (val) => {
      process.env[PERSONAL_PRO_FLAG] = val;
      expect(isPersonalProEnabled()).toBe(false);
    },
  );

  it("is read at call time (toggle without re-import)", () => {
    process.env[PERSONAL_PRO_FLAG] = "true";
    expect(isPersonalProEnabled()).toBe(true);
    process.env[PERSONAL_PRO_FLAG] = "false";
    expect(isPersonalProEnabled()).toBe(false);
  });

  it("is independent of ENABLE_PLATFORM_BILLING", () => {
    delete process.env[PLATFORM_BILLING_FLAG];
    process.env[PERSONAL_PRO_FLAG] = "true";
    expect(isPersonalProEnabled()).toBe(true);
    expect(isPlatformBillingEnabled()).toBe(false);
  });
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
});
