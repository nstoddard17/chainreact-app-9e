/**
 * Pure bucketing helpers for the Notion analytics source
 * (Slice ANALYTICS-SOURCES-NOTION-1). No I/O.
 */

import {
  bucketIndexForMs,
  inRange,
  planBuckets,
} from "@/services/analytics/sources/notion/buckets";

describe("planBuckets", () => {
  it("day-buckets a short range and bounds a long one to <= 12", () => {
    expect(planBuckets("2026-06-01T00:00:00Z", "2026-06-04T00:00:00Z").length).toBe(4);
    expect(planBuckets("2026-01-01T00:00:00Z", "2026-12-31T00:00:00Z").length).toBeLessThanOrEqual(12);
  });

  it("returns [] for an invalid / inverted range", () => {
    expect(planBuckets("nope", "2026-06-04T00:00:00Z")).toEqual([]);
    expect(planBuckets("2026-06-04T00:00:00Z", "2026-06-01T00:00:00Z")).toEqual([]);
  });
});

describe("bucketIndexForMs", () => {
  const buckets = planBuckets("2026-06-01T00:00:00Z", "2026-06-03T00:00:00Z");
  it("maps a ms to its bucket; -1 for out-of-range or null", () => {
    expect(bucketIndexForMs(buckets, Date.parse("2026-06-02T08:00:00Z"))).toBe(1);
    expect(bucketIndexForMs(buckets, Date.parse("2026-05-01T00:00:00Z"))).toBe(-1);
    expect(bucketIndexForMs(buckets, null)).toBe(-1);
  });
});

describe("inRange", () => {
  const since = Date.parse("2026-06-01T00:00:00Z");
  const until = Date.parse("2026-06-04T00:00:00Z");
  it("true within [since, until), false otherwise / null", () => {
    expect(inRange(Date.parse("2026-06-02T00:00:00Z"), since, until)).toBe(true);
    expect(inRange(Date.parse("2026-06-04T00:00:00Z"), since, until)).toBe(false); // exclusive end
    expect(inRange(Date.parse("2026-05-31T00:00:00Z"), since, until)).toBe(false);
    expect(inRange(null, since, until)).toBe(false);
  });
});
