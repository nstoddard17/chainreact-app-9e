/** @jest-environment node */
/**
 * Pure bucketing + validation helpers for the Trello analytics source
 * (Slice ANALYTICS-SOURCES-TRELLO-1). No I/O.
 */

import {
  bucketIndexForMs,
  cardCreatedMs,
  parseBoardId,
  planBuckets,
} from "@/services/analytics/sources/trello/buckets";

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
  it("accepts a 24-hex board id", () => {
    expect(parseBoardId("5f1a2b3c4d5e6f7a8b9c0d1e")).toBe("5f1a2b3c4d5e6f7a8b9c0d1e");
  });
  it("rejects non-hex / wrong-length / non-string", () => {
    expect(() => parseBoardId("not-hex")).toThrow();
    expect(() => parseBoardId("5f1a2b3c")).toThrow(); // too short
    expect(() => parseBoardId("5F1A2B3C4D5E6F7A8B9C0D1E")).toThrow(); // uppercase
    expect(() => parseBoardId("")).toThrow();
    expect(() => parseBoardId(42)).toThrow();
  });
});

describe("cardCreatedMs (derived from the id's embedded timestamp)", () => {
  it("decodes the first 8 hex chars as Unix seconds", () => {
    // 0x68000000 = 1744830464 s → ms
    const id = "68000000aaaaaaaaaaaaaaaa";
    expect(cardCreatedMs(id)).toBe(parseInt("68000000", 16) * 1000);
  });
  it("returns null for a non-hex / short id", () => {
    expect(cardCreatedMs("zzzz")).toBeNull();
    expect(cardCreatedMs("")).toBeNull();
  });
});
