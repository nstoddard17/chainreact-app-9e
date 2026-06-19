/**
 * Pure bucketing helpers for the HubSpot analytics source
 * (Slice ANALYTICS-SOURCES-HUBSPOT-1). No I/O.
 */

import { MAX_BUCKETS, parsePipelineId, planBuckets } from "@/services/analytics/sources/hubspot/buckets";

describe("planBuckets", () => {
  it("day-buckets a short range with UTC-day keys + [start,end) windows", () => {
    const b = planBuckets("2026-06-01T00:00:00Z", "2026-06-04T00:00:00Z");
    expect(b.length).toBe(4);
    expect(b[0]!.key).toBe("2026-06-01");
    expect(b[0]!.startMs).toBe(Date.parse("2026-06-01T00:00:00Z"));
    expect(b[0]!.endMs).toBe(Date.parse("2026-06-02T00:00:00Z"));
    // Contiguous, non-overlapping windows.
    expect(b[1]!.startMs).toBe(b[0]!.endMs);
  });

  it("widens the bucket size so a long range never exceeds MAX_BUCKETS", () => {
    const b = planBuckets("2026-01-01T00:00:00Z", "2026-12-31T00:00:00Z");
    expect(b.length).toBeLessThanOrEqual(MAX_BUCKETS);
    expect(b.length).toBeGreaterThan(0);
  });

  it("returns [] for an invalid / inverted range", () => {
    expect(planBuckets("nope", "2026-06-04T00:00:00Z")).toEqual([]);
    expect(planBuckets("2026-06-04T00:00:00Z", "2026-06-01T00:00:00Z")).toEqual([]);
  });
});

describe("parsePipelineId", () => {
  it("accepts safe pipeline id tokens", () => {
    expect(parsePipelineId("default")).toBe("default");
    expect(parsePipelineId("123456789")).toBe("123456789");
    expect(parsePipelineId("pipeline_a-1")).toBe("pipeline_a-1");
  });

  it("rejects empty / non-string / unsafe values", () => {
    expect(() => parsePipelineId("")).toThrow();
    expect(() => parsePipelineId("bad id!")).toThrow();
    expect(() => parsePipelineId("../../etc")).toThrow();
    expect(() => parsePipelineId(42)).toThrow();
    expect(() => parsePipelineId(undefined)).toThrow();
  });
});
