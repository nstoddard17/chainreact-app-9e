/**
 * Pure bucketing + audience-id validation helpers for the Mailchimp analytics
 * source (Slice ANALYTICS-SOURCES-MAILCHIMP-1). No I/O.
 */

import {
  MAX_BUCKETS,
  bucketIndexForMs,
  parseAudienceId,
  planBuckets,
} from "@/services/analytics/sources/mailchimp/buckets";

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

describe("parseAudienceId", () => {
  it("accepts a Mailchimp audience id token", () => {
    expect(parseAudienceId("a1b2c3d4e5")).toBe("a1b2c3d4e5");
  });
  it("rejects empty / non-string / unsafe values", () => {
    expect(() => parseAudienceId("")).toThrow();
    expect(() => parseAudienceId("bad id!")).toThrow();
    expect(() => parseAudienceId("../../etc")).toThrow();
    expect(() => parseAudienceId(42)).toThrow();
    expect(() => parseAudienceId(undefined)).toThrow();
  });
});
