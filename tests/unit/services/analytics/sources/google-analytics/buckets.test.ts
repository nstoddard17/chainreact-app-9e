/**
 * Pure bucketing + GA-date parsing + property-id validation helpers for the Google
 * Analytics analytics source (Slice ANALYTICS-SOURCES-GA-1). No I/O.
 */

import {
  MAX_BUCKETS,
  bucketIndexForMs,
  parseGaDate,
  parseMetricValue,
  parsePropertyId,
  planBuckets,
  toGaDate,
} from "@/services/analytics/sources/google-analytics/buckets";

describe("planBuckets / bucketIndexForMs", () => {
  it("day-buckets a short range and maps a ms into its bucket", () => {
    const b = planBuckets("2026-06-01T00:00:00Z", "2026-06-04T00:00:00Z");
    expect(b.length).toBe(4);
    expect(bucketIndexForMs(b, Date.parse("2026-06-02T08:00:00Z"))).toBe(1);
    expect(bucketIndexForMs(b, Date.parse("2026-05-01T00:00:00Z"))).toBe(-1);
    expect(bucketIndexForMs(b, null)).toBe(-1);
  });

  it("never exceeds MAX_BUCKETS for a long range", () => {
    const b = planBuckets("2026-01-01T00:00:00Z", "2026-12-31T00:00:00Z");
    expect(b.length).toBeLessThanOrEqual(MAX_BUCKETS);
    expect(b.length).toBeGreaterThan(0);
  });

  it("returns [] for an invalid / inverted range", () => {
    expect(planBuckets("nope", "2026-06-04T00:00:00Z")).toEqual([]);
    expect(planBuckets("2026-06-04T00:00:00Z", "2026-06-01T00:00:00Z")).toEqual([]);
  });
});

describe("parseGaDate (GA4 `date` dimension YYYYMMDD)", () => {
  it("parses a YYYYMMDD day to UTC midnight ms", () => {
    expect(parseGaDate("20260602")).toBe(Date.UTC(2026, 5, 2));
    expect(parseGaDate(" 20260602 ")).toBe(Date.UTC(2026, 5, 2)); // trims
  });
  it("drops the `(other)` / malformed / non-string rows", () => {
    expect(parseGaDate("(other)")).toBeNull();
    expect(parseGaDate("2026-06-02")).toBeNull();
    expect(parseGaDate("20261302")).toBeNull(); // month 13
    expect(parseGaDate("20260640")).toBeNull(); // day 40
    expect(parseGaDate(20260602)).toBeNull(); // non-string
    expect(parseGaDate(undefined)).toBeNull();
  });
});

describe("toGaDate (ISO → YYYY-MM-DD)", () => {
  it("formats an ISO timestamp to the GA date form", () => {
    expect(toGaDate("2026-06-02T15:30:00Z")).toBe("2026-06-02");
  });
  it("returns null for an unparseable value", () => {
    expect(toGaDate("nope")).toBeNull();
  });
});

describe("parseMetricValue", () => {
  it("parses + rounds numeric string values; non-numeric → 0", () => {
    expect(parseMetricValue("1234")).toBe(1234);
    expect(parseMetricValue("12.5")).toBe(13);
    expect(parseMetricValue(42)).toBe(42);
    expect(parseMetricValue("abc")).toBe(0);
    expect(parseMetricValue(undefined)).toBe(0);
    expect(parseMetricValue(null)).toBe(0);
  });
});

describe("parsePropertyId (required GA4 numeric property id)", () => {
  it("accepts a bare numeric property id", () => {
    expect(parsePropertyId("123456789")).toBe("123456789");
    expect(parsePropertyId(" 123456789 ")).toBe("123456789"); // trims
  });
  it("rejects missing / non-numeric / over-long values", () => {
    expect(() => parsePropertyId(undefined)).toThrow();
    expect(() => parsePropertyId(null)).toThrow();
    expect(() => parsePropertyId("")).toThrow();
    expect(() => parsePropertyId("properties/123")).toThrow();
    expect(() => parsePropertyId("12 34")).toThrow();
    expect(() => parsePropertyId("abc")).toThrow();
    expect(() => parsePropertyId("1".repeat(21))).toThrow();
    expect(() => parsePropertyId(42)).toThrow();
  });
});
