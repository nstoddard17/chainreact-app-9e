/** @jest-environment node */
/**
 * Pure bucketing + Graph-id validation helpers for the Microsoft Teams analytics source
 * (Slice ANALYTICS-SOURCES-TEAMS-1). No I/O.
 */

import {
  MAX_BUCKETS,
  bucketIndexForMs,
  parseChannelId,
  parseTeamId,
  planBuckets,
} from "@/services/analytics/sources/microsoft-teams/buckets";

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

describe("parseTeamId / parseChannelId (required Graph ids)", () => {
  it("accepts opaque Graph team + channel ids", () => {
    expect(parseTeamId("19:abcTEAMid@thread.tacv2")).toBe("19:abcTEAMid@thread.tacv2");
    expect(parseChannelId("19:abcCHANNELid@thread.tacv2")).toBe("19:abcCHANNELid@thread.tacv2");
    expect(parseTeamId("aa11bb22-cc33-dd44-ee55-ff6677889900")).toBe("aa11bb22-cc33-dd44-ee55-ff6677889900");
    expect(parseTeamId(" 19:x@thread.tacv2 ")).toBe("19:x@thread.tacv2"); // trims
  });
  it("rejects missing / non-string / unsafe values", () => {
    expect(() => parseTeamId(undefined)).toThrow();
    expect(() => parseTeamId(null)).toThrow();
    expect(() => parseTeamId("")).toThrow();
    expect(() => parseChannelId("bad id with spaces")).toThrow();
    expect(() => parseChannelId("../etc")).toThrow();
    expect(() => parseChannelId("x'; DROP")).toThrow();
    expect(() => parseTeamId(42)).toThrow();
  });
});
