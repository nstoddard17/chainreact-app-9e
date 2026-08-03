/** @jest-environment node */
/**
 * Pure bucketing + id-validation helpers for the Airtable analytics source
 * (Slice ANALYTICS-SOURCES-AIRTABLE-1). No I/O.
 */

import {
  bucketIndexForMs,
  parseBaseId,
  parseTableId,
  planBuckets,
} from "@/services/analytics/sources/airtable/buckets";

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

describe("parseBaseId", () => {
  it("accepts an appXXX base id", () => {
    expect(parseBaseId("app0123456789abcd")).toBe("app0123456789abcd");
  });
  it("rejects non-app / wrong-shape / non-string", () => {
    expect(() => parseBaseId("tbl0123456789abcd")).toThrow();
    expect(() => parseBaseId("app123")).toThrow(); // too short
    expect(() => parseBaseId("bad")).toThrow();
    expect(() => parseBaseId("")).toThrow();
    expect(() => parseBaseId(42)).toThrow();
  });
});

describe("parseTableId", () => {
  it("accepts a tblXXX table id (id form only, never a name)", () => {
    expect(parseTableId("tbl0123456789abcd")).toBe("tbl0123456789abcd");
  });
  it("rejects names / non-tbl / non-string", () => {
    expect(() => parseTableId("My Table")).toThrow();
    expect(() => parseTableId("app0123456789abcd")).toThrow();
    expect(() => parseTableId("tbl123")).toThrow();
    expect(() => parseTableId(42)).toThrow();
  });
});
