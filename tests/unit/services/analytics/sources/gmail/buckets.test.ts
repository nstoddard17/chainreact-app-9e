/**
 * @jest-environment node
 *
 * Pure Gmail analytics bucketing + query-builders + validation
 * (Slice ANALYTICS-SOURCES-GMAIL-1). No I/O. Pins the approved server-owned
 * queries + the label-id validation (no raw query from widget config).
 */

import {
  MAX_BUCKETS,
  RECEIVED_BASE_QUERY,
  SENT_BASE_QUERY,
  UNREAD_QUERY,
  dateRangeQuery,
  gmailDate,
  parseLabelId,
  planBuckets,
} from "@/services/analytics/sources/gmail/buckets";

describe("planBuckets", () => {
  it("returns [] for invalid/empty window", () => {
    expect(planBuckets("nope", "nope")).toEqual([]);
    expect(planBuckets("2026-06-05T00:00:00Z", "2026-06-01T00:00:00Z")).toEqual([]);
  });
  it("buckets a short range by day", () => {
    const b = planBuckets("2026-06-01T00:00:00Z", "2026-06-03T00:00:00Z");
    expect(b.map((x) => x.key)).toEqual(["2026-06-01", "2026-06-02", "2026-06-03"]);
    expect(b[0]!.endMs).toBe(b[1]!.startMs);
  });
  it("never exceeds MAX_BUCKETS for a long range", () => {
    expect(planBuckets("2024-01-01T00:00:00Z", "2026-01-01T00:00:00Z").length).toBeLessThanOrEqual(
      MAX_BUCKETS,
    );
  });
});

describe("query builders (server-owned, not user input)", () => {
  it("gmailDate → YYYY/MM/DD UTC", () => {
    expect(gmailDate(Date.parse("2026-06-07T00:00:00Z"))).toBe("2026/06/07");
  });
  it("dateRangeQuery → after/before", () => {
    expect(
      dateRangeQuery(Date.parse("2026-06-01T00:00:00Z"), Date.parse("2026-06-02T00:00:00Z")),
    ).toBe("after:2026/06/01 before:2026/06/02");
  });
  it("approved base queries are constants", () => {
    expect(RECEIVED_BASE_QUERY).toContain("-in:sent");
    expect(SENT_BASE_QUERY).toBe("in:sent");
    expect(UNREAD_QUERY).toBe("is:unread in:inbox");
  });
});

describe("parseLabelId", () => {
  it("accepts system + user label ids", () => {
    expect(parseLabelId("INBOX")).toBe("INBOX");
    expect(parseLabelId("CATEGORY_PERSONAL")).toBe("CATEGORY_PERSONAL");
    expect(parseLabelId("Label_42")).toBe("Label_42");
  });
  it("rejects empty / spaces / injection-ish / over-long / non-string", () => {
    expect(() => parseLabelId("")).toThrow();
    expect(() => parseLabelId("has space")).toThrow();
    expect(() => parseLabelId("a:b")).toThrow();
    expect(() => parseLabelId("x".repeat(129))).toThrow();
    expect(() => parseLabelId(undefined)).toThrow();
  });
});
