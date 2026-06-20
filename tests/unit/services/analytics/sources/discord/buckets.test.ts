/**
 * Pure bucketing + snowflake validation helpers for the Discord analytics source
 * (Slice ANALYTICS-SOURCES-DISCORD-1). No I/O.
 */

import {
  MAX_BUCKETS,
  bucketIndexForMs,
  parseChannelId,
  parseGuildId,
  planBuckets,
} from "@/services/analytics/sources/discord/buckets";

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

describe("parseGuildId / parseChannelId (required snowflakes)", () => {
  it("accepts a valid Discord snowflake", () => {
    expect(parseGuildId("112233445566778899")).toBe("112233445566778899");
    expect(parseChannelId("998877665544332211")).toBe("998877665544332211");
    expect(parseGuildId(" 112233445566778899 ")).toBe("112233445566778899"); // trims
  });
  it("rejects missing / non-string / non-numeric / out-of-range values", () => {
    expect(() => parseGuildId(undefined)).toThrow();
    expect(() => parseGuildId(null)).toThrow();
    expect(() => parseGuildId("")).toThrow();
    expect(() => parseChannelId("not-a-snowflake")).toThrow();
    expect(() => parseChannelId("123")).toThrow(); // too short
    expect(() => parseChannelId("12345678901234567890123")).toThrow(); // too long
    expect(() => parseChannelId("123'; DROP" )).toThrow();
    expect(() => parseGuildId(42)).toThrow();
  });
});
