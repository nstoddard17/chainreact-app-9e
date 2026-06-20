/**
 * Pure bucketing + page-id validation helpers for the Facebook analytics source (Slice
 * ANALYTICS-SOURCES-FACEBOOK-1). No I/O.
 */

import {
  MAX_BUCKETS,
  bucketIndexForMs,
  parsePageId,
  planBuckets,
} from "@/services/analytics/sources/facebook/buckets";

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

describe("parsePageId (required numeric Page id)", () => {
  it("accepts a numeric Facebook Page id", () => {
    expect(parsePageId("1234567890")).toBe("1234567890");
    expect(parsePageId(" 1234567890 ")).toBe("1234567890"); // trims
  });
  it("rejects missing / non-string / non-numeric values", () => {
    expect(() => parsePageId(undefined)).toThrow();
    expect(() => parsePageId(null)).toThrow();
    expect(() => parsePageId("")).toThrow();
    expect(() => parsePageId("not-a-page")).toThrow();
    expect(() => parsePageId("123'; DROP")).toThrow();
    expect(() => parsePageId(42)).toThrow();
  });
});
