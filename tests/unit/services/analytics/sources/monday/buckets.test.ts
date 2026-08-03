/** @jest-environment node */
/**
 * Pure bucketing + board-id-validation helpers for the Monday analytics source
 * (Slice ANALYTICS-SOURCES-MONDAY-1). No I/O.
 */

import {
  bucketIndexForMs,
  parseBoardId,
  planBuckets,
} from "@/services/analytics/sources/monday/buckets";

describe("planBuckets / bucketIndexForMs", () => {
  it("day-buckets a short range and maps a ms into its bucket", () => {
    const b = planBuckets("2026-06-01T00:00:00Z", "2026-06-04T00:00:00Z");
    expect(b.length).toBe(4);
    expect(bucketIndexForMs(b, Date.parse("2026-06-02T08:00:00Z"))).toBe(1);
    expect(bucketIndexForMs(b, Date.parse("2026-05-01T00:00:00Z"))).toBe(-1);
    expect(bucketIndexForMs(b, null)).toBe(-1);
  });

  it("returns [] for an invalid / inverted range", () => {
    expect(planBuckets("nope", "2026-06-04T00:00:00Z")).toEqual([]);
    expect(planBuckets("2026-06-04T00:00:00Z", "2026-06-01T00:00:00Z")).toEqual([]);
  });
});

describe("parseBoardId", () => {
  it("accepts a numeric Monday board id", () => {
    expect(parseBoardId("1234567890")).toBe("1234567890");
  });
  it("rejects non-numeric / empty / non-string", () => {
    expect(() => parseBoardId("abc")).toThrow();
    expect(() => parseBoardId("12a34")).toThrow();
    expect(() => parseBoardId("")).toThrow();
    expect(() => parseBoardId(42)).toThrow();
  });
});
