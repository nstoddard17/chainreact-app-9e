/**
 * Pure bucketing + Graph $filter builders for the Outlook analytics source
 * (Slice ANALYTICS-SOURCES-OUTLOOK-1). No I/O.
 */

import {
  INBOX_FOLDER,
  SENT_FOLDER,
  UNREAD_FILTER,
  parseFolderId,
  planBuckets,
  receivedRangeFilter,
  sentRangeFilter,
  toGraphDateTime,
} from "@/services/analytics/sources/microsoft-outlook/buckets";

describe("planBuckets", () => {
  it("day-buckets a short range", () => {
    const b = planBuckets("2026-06-01T00:00:00Z", "2026-06-04T00:00:00Z");
    expect(b.length).toBe(4);
    expect(b[0]!.key).toBe("2026-06-01");
    expect(b.every((x) => x.endMs > x.startMs)).toBe(true);
  });

  it("returns [] for an invalid / inverted range", () => {
    expect(planBuckets("nope", "2026-06-04T00:00:00Z")).toEqual([]);
    expect(planBuckets("2026-06-04T00:00:00Z", "2026-06-01T00:00:00Z")).toEqual([]);
  });

  it("bounds a long range to <= 12 buckets", () => {
    expect(planBuckets("2026-01-01T00:00:00Z", "2026-12-31T00:00:00Z").length).toBeLessThanOrEqual(12);
  });
});

describe("Graph $filter builders (server-owned constants)", () => {
  it("UNREAD_FILTER + well-known folders are fixed", () => {
    expect(UNREAD_FILTER).toBe("isRead eq false");
    expect(INBOX_FOLDER).toBe("inbox");
    expect(SENT_FOLDER).toBe("sentitems");
  });

  it("toGraphDateTime emits RFC 3339 Z", () => {
    expect(toGraphDateTime(Date.parse("2026-06-01T00:00:00Z"))).toBe("2026-06-01T00:00:00.000Z");
  });

  it("received/sent range filters use the right datetime property", () => {
    const s = Date.parse("2026-06-01T00:00:00Z");
    const e = Date.parse("2026-06-02T00:00:00Z");
    expect(receivedRangeFilter(s, e)).toBe(
      "receivedDateTime ge 2026-06-01T00:00:00.000Z and receivedDateTime lt 2026-06-02T00:00:00.000Z",
    );
    expect(sentRangeFilter(s, e)).toContain("sentDateTime ge 2026-06-01T00:00:00.000Z");
  });
});

describe("parseFolderId", () => {
  it("accepts well-known names and Graph base64url ids", () => {
    expect(parseFolderId("inbox")).toBe("inbox");
    expect(parseFolderId("AQMkAD_123-xyz=")).toBe("AQMkAD_123-xyz=");
  });

  it("rejects injection / whitespace / overlong values", () => {
    expect(() => parseFolderId("bad id")).toThrow();
    expect(() => parseFolderId("a/b")).toThrow();
    expect(() => parseFolderId("")).toThrow();
    expect(() => parseFolderId(42)).toThrow();
    expect(() => parseFolderId("x".repeat(257))).toThrow();
  });
});
