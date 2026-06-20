/**
 * Pure bucketing + workbook-id validation helpers for the Microsoft Excel analytics
 * source (Slice ANALYTICS-SOURCES-EXCEL-1). No I/O.
 */

import {
  MAX_BUCKETS,
  bucketIndexForMs,
  parseWorkbookId,
  planBuckets,
} from "@/services/analytics/sources/microsoft-excel/buckets";

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

describe("parseWorkbookId (required Graph DriveItem id)", () => {
  it("accepts an opaque Graph workbook id", () => {
    expect(parseWorkbookId("01ABCWORKBOOK!123")).toBe("01ABCWORKBOOK!123");
    expect(parseWorkbookId("ABC-123_xyz=")).toBe("ABC-123_xyz=");
    expect(parseWorkbookId(" 01ABC!123 ")).toBe("01ABC!123"); // trims
  });
  it("rejects missing / non-string / unsafe values", () => {
    expect(() => parseWorkbookId(undefined)).toThrow();
    expect(() => parseWorkbookId(null)).toThrow();
    expect(() => parseWorkbookId("")).toThrow();
    expect(() => parseWorkbookId("bad id with spaces")).toThrow();
    expect(() => parseWorkbookId("../etc")).toThrow();
    expect(() => parseWorkbookId(42)).toThrow();
  });
});
