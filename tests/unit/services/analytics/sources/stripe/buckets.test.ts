/** @jest-environment node */
/**
 * Pure bucketing + currency helpers for the Stripe analytics source
 * (Slice ANALYTICS-SOURCES-STRIPE-1). No I/O.
 */

import {
  bucketIndexForMs,
  currencyDecimals,
  dominantCurrency,
  minorToMajor,
  planBuckets,
  roundMajor,
} from "@/services/analytics/sources/stripe/buckets";

describe("planBuckets", () => {
  it("day-buckets a short range and bounds to MAX_BUCKETS", () => {
    const b = planBuckets("2026-06-01T00:00:00Z", "2026-06-04T00:00:00Z");
    expect(b.length).toBe(4);
    expect(b[0]!.key).toBe("2026-06-01");
    expect(b.every((x) => x.endMs > x.startMs)).toBe(true);
  });

  it("returns [] for an invalid / inverted range", () => {
    expect(planBuckets("nope", "2026-06-04T00:00:00Z")).toEqual([]);
    expect(planBuckets("2026-06-04T00:00:00Z", "2026-06-01T00:00:00Z")).toEqual([]);
  });

  it("never exceeds MAX_BUCKETS for a long range", () => {
    const b = planBuckets("2026-01-01T00:00:00Z", "2026-12-31T00:00:00Z");
    expect(b.length).toBeLessThanOrEqual(12);
  });
});

describe("bucketIndexForMs", () => {
  const buckets = planBuckets("2026-06-01T00:00:00Z", "2026-06-03T00:00:00Z");
  it("maps a ms into its bucket; -1 when out of range", () => {
    expect(bucketIndexForMs(buckets, Date.parse("2026-06-01T05:00:00Z"))).toBe(0);
    expect(bucketIndexForMs(buckets, Date.parse("2026-05-01T00:00:00Z"))).toBe(-1);
  });
});

describe("currency minor→major", () => {
  it("two-decimal currencies divide by 100", () => {
    expect(currencyDecimals("usd")).toBe(2);
    expect(minorToMajor(1234, "usd")).toBeCloseTo(12.34);
    expect(minorToMajor(1234, "EUR")).toBeCloseTo(12.34); // case-insensitive
  });

  it("zero-decimal currencies are already major units", () => {
    expect(currencyDecimals("jpy")).toBe(0);
    expect(minorToMajor(1234, "jpy")).toBe(1234);
  });

  it("three-decimal currencies divide by 1000", () => {
    expect(currencyDecimals("bhd")).toBe(3);
    expect(minorToMajor(1234, "bhd")).toBeCloseTo(1.234);
  });

  it("roundMajor tames float-accumulation noise", () => {
    expect(roundMajor(0.1 + 0.2)).toBe(0.3);
  });
});

describe("dominantCurrency", () => {
  it("picks the currency with the most charges and flags multi-currency", () => {
    const facts = [
      { currency: "usd" },
      { currency: "usd" },
      { currency: "eur" },
    ];
    expect(dominantCurrency(facts)).toEqual({ currency: "usd", multiCurrency: true });
  });

  it("single currency is not flagged multi", () => {
    expect(dominantCurrency([{ currency: "USD" }, { currency: "usd" }])).toEqual({
      currency: "usd",
      multiCurrency: false,
    });
  });

  it("empty set → null currency", () => {
    expect(dominantCurrency([])).toEqual({ currency: null, multiCurrency: false });
  });
});
