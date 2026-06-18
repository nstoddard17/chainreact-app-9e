import {
  getAnalyticsSource,
  getAnalyticsSourceMetric,
  isApprovedSourceMetric,
  listAnalyticsSources,
} from "@/services/analytics/sources/registry";

/**
 * Analytics source registry (Slice ANALYTICS-SOURCES-1) — approved-only lookup;
 * unknown provider/metric rejected. No dynamic dispatch from arbitrary strings.
 */

describe("analytics source registry", () => {
  it("resolves a registered source", () => {
    const s = getAnalyticsSource("internal");
    expect(s).not.toBeNull();
    expect(s?.providerKey).toBe("internal");
    expect(s?.connectedApp).toBe(false);
  });

  it("returns null for an unknown provider (no arbitrary execution)", () => {
    expect(getAnalyticsSource("definitely-not-a-provider")).toBeNull();
    expect(getAnalyticsSource("__proto__")).toBeNull();
    expect(getAnalyticsSource("")).toBeNull();
  });

  it("resolves an approved metric and rejects unknown ones", () => {
    expect(getAnalyticsSourceMetric("internal", "runs_over_time")).not.toBeNull();
    expect(getAnalyticsSourceMetric("internal", "rm -rf")).toBeNull();
    expect(getAnalyticsSourceMetric("nope", "runs_over_time")).toBeNull();
  });

  it("isApprovedSourceMetric gates (provider, metric) pairs", () => {
    expect(isApprovedSourceMetric("internal", "success_rate")).toBe(true);
    expect(isApprovedSourceMetric("internal", "arbitrary_method")).toBe(false);
    expect(isApprovedSourceMetric("stripe", "revenue")).toBe(false); // not registered yet
  });

  it("lists approved sources with their metric catalog", () => {
    const cat = listAnalyticsSources();
    const internal = cat.find((c) => c.providerKey === "internal");
    expect(internal).toBeDefined();
    expect(internal?.metrics.map((m) => m.key)).toEqual(
      expect.arrayContaining(["runs_over_time", "success_rate", "top_workflows"]),
    );
    // No connected-app source is registered in this foundation slice.
    expect(cat.every((c) => c.connectedApp === false)).toBe(true);
  });
});
