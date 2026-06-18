/**
 * @jest-environment node
 *
 * Pure Slack analytics bucketing + validation (Slice ANALYTICS-SOURCES-SLACK-1).
 * No I/O. Covers the security-relevant validators (channel shape rejects DMs,
 * keyword bounds) plus the time math.
 */

import {
  MAX_BUCKETS,
  bucketIndexForMs,
  isoToSlackTs,
  parseChannelRef,
  parseKeyword,
  planBuckets,
  slackTsToMs,
} from "@/services/analytics/sources/slack/buckets";

describe("planBuckets", () => {
  it("returns [] for an invalid/empty window", () => {
    expect(planBuckets("nope", "nope")).toEqual([]);
    expect(planBuckets("2026-06-03T00:00:00Z", "2026-06-01T00:00:00Z")).toEqual([]);
  });

  it("buckets a short range by day", () => {
    const b = planBuckets("2026-06-01T00:00:00Z", "2026-06-03T00:00:00Z");
    expect(b.map((x) => x.key)).toEqual(["2026-06-01", "2026-06-02", "2026-06-03"]);
    // Contiguous, non-overlapping: each end is the next start.
    expect(b[0]!.endMs).toBe(b[1]!.startMs);
  });

  it("never exceeds MAX_BUCKETS even for a long range", () => {
    const b = planBuckets("2024-01-01T00:00:00Z", "2026-01-01T00:00:00Z");
    expect(b.length).toBeLessThanOrEqual(MAX_BUCKETS);
  });
});

describe("parseChannelRef (security: DMs rejected)", () => {
  it("accepts public (C…) and private (G…) channel ids", () => {
    expect(parseChannelRef("C012AB3CD")).toBe("C012AB3CD");
    expect(parseChannelRef("G0123ABCD")).toBe("G0123ABCD");
  });

  it("rejects a DM id, junk, and non-strings", () => {
    expect(() => parseChannelRef("D012AB3CD")).toThrow(); // direct message
    expect(() => parseChannelRef("not-a-channel")).toThrow();
    expect(() => parseChannelRef("")).toThrow();
    expect(() => parseChannelRef(undefined)).toThrow();
    expect(() => parseChannelRef(42)).toThrow();
  });
});

describe("parseKeyword", () => {
  it("accepts a trimmed 2–80 char keyword", () => {
    expect(parseKeyword("  launch  ")).toBe("launch");
  });
  it("rejects too short / too long / non-string", () => {
    expect(() => parseKeyword("a")).toThrow();
    expect(() => parseKeyword("x".repeat(81))).toThrow();
    expect(() => parseKeyword(undefined)).toThrow();
  });
});

describe("timestamp helpers", () => {
  it("isoToSlackTs → unix-seconds string", () => {
    expect(isoToSlackTs("2026-06-01T00:00:00Z")).toBe(`${Math.floor(Date.parse("2026-06-01T00:00:00Z") / 1000)}.000000`);
    expect(isoToSlackTs("garbage")).toBe("0");
  });

  it("slackTsToMs parses / rejects", () => {
    // Slack's microsecond suffix is sub-millisecond → rounds away.
    expect(slackTsToMs("1730000000.000123")).toBe(1730000000000);
    expect(slackTsToMs("1730000000.500000")).toBe(1730000000500);
    expect(slackTsToMs("nope")).toBeNull();
    expect(slackTsToMs(undefined)).toBeNull();
  });

  it("bucketIndexForMs maps a ms into the right bucket, -1 when out of range", () => {
    const b = planBuckets("2026-06-01T00:00:00Z", "2026-06-03T00:00:00Z");
    expect(bucketIndexForMs(b, Date.parse("2026-06-02T12:00:00Z"))).toBe(1);
    expect(bucketIndexForMs(b, Date.parse("2030-01-01T00:00:00Z"))).toBe(-1);
  });
});
