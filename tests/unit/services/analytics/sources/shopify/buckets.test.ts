/**
 * Pure bucketing + currency helpers for the Shopify analytics source
 * (Slice ANALYTICS-SOURCES-SHOPIFY-1). No I/O.
 */

import {
  MAX_BUCKETS,
  bucketIndexForMs,
  dominantCurrency,
  planBuckets,
  roundMajor,
} from "@/services/analytics/sources/shopify/buckets";
import { nextPageInfo } from "@/services/analytics/sources/shopify/api";

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

describe("roundMajor", () => {
  it("rounds float accumulation noise to 2 dp", () => {
    expect(roundMajor(0.1 + 0.2)).toBe(0.3);
    expect(roundMajor(150)).toBe(150);
  });
});

describe("dominantCurrency", () => {
  it("picks the most frequent currency and flags multi-currency", () => {
    const dom = dominantCurrency([{ currency: "usd" }, { currency: "usd" }, { currency: "eur" }]);
    expect(dom.currency).toBe("usd");
    expect(dom.multiCurrency).toBe(true);
  });
  it("single currency is not flagged multi", () => {
    expect(dominantCurrency([{ currency: "USD" }])).toEqual({ currency: "usd", multiCurrency: false });
  });
  it("empty set → null", () => {
    expect(dominantCurrency([])).toEqual({ currency: null, multiCurrency: false });
  });
});

describe("nextPageInfo (Link header cursor)", () => {
  it("extracts page_info from a rel=next Link header", () => {
    const link =
      '<https://x.myshopify.com/admin/api/2024-10/orders.json?limit=250&page_info=abc123>; rel="next"';
    expect(nextPageInfo(link)).toBe("abc123");
  });
  it("returns null when there is no next link", () => {
    const link = '<https://x.myshopify.com/.../orders.json?page_info=prev>; rel="previous"';
    expect(nextPageInfo(link)).toBeNull();
    expect(nextPageInfo(null)).toBeNull();
  });
});
