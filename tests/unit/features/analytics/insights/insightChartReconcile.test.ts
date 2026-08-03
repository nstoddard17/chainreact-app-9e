/** @jest-environment node */
import {
  insightDraftFromConfig,
  reconcileInsightDraft,
  type InsightDraft,
} from "@/features/analytics/insights/reconcileInsightConfig";
import {
  availableDimensionChoices,
  chartChoices,
  defaultChartFor,
  findDataset,
  findMeasure,
  findSource,
  isPartToWhole,
} from "@/features/analytics/insights/insightCatalog";
import {
  insightConfigFromDraft,
  insightQueryFromConfig,
} from "@/features/analytics/insights/insightQueryFromConfig";
import { FIXTURE_CATALOG } from "./fixtures";

/**
 * CD-3B chart-type reconciliation: every transition preserves the business
 * question where it still holds, clears only what genuinely broke, and
 * explains itself. Driven entirely by the fictional fixture catalog — proof
 * the rules are catalog-derived, not provider-specific.
 */

function draft(over: Partial<InsightDraft> = {}): InsightDraft {
  return {
    source: "acme",
    dataset: "orders",
    measure: "order_count",
    dimension: "time",
    timeGrain: "week",
    filters: { include_drafts: true },
    series: null,
    range: { preset: "30d" },
    compare: false,
    sort: null,
    chart: "line",
    ...over,
  };
}

const acme = findSource(FIXTURE_CATALOG, "acme")!;
const orders = findDataset(acme, "orders")!;
const orderCount = findMeasure(orders, "order_count")!;

describe("catalog-derived chart availability", () => {
  it("offers kpi/table ungrouped, line/bar/table over time, bar/table/donut by category", () => {
    expect(chartChoices(orders, orderCount, null)).toEqual(["kpi", "table"]);
    expect(chartChoices(orders, orderCount, "time")).toEqual(["line", "bar", "table"]);
    expect(chartChoices(orders, orderCount, "status")).toEqual(["bar", "table", "donut"]);
  });

  it("donut ONLY on a declared part-to-whole dimension", () => {
    expect(isPartToWhole(orders, "status")).toBe(true);
    expect(isPartToWhole(orders, "item")).toBe(false);
    // `item` is a declared dimension but not part-to-whole → no donut.
    expect(chartChoices(orders, orderCount, "item")).toEqual(["bar", "table"]);
  });

  it("a dataset that doesn't declare donut never offers it", () => {
    const internal = findSource(FIXTURE_CATALOG, "internal_app")!;
    const events = findDataset(internal, "events")!;
    const count = findMeasure(events, "event_count")!;
    expect(events.charts).not.toContain("donut");
    expect(chartChoices(events, count, "thing")).toEqual(["bar", "table"]);
  });

  it("categorical groupings are offered now that bar/table can render them", () => {
    const ids = availableDimensionChoices(orders, orderCount).map((c) => c.id);
    expect(ids).toContain(null);
    expect(ids).toContain("time");
    expect(ids).toContain("status");
    expect(ids).toContain("item");
  });

  it("a measure's dimension capability still bounds the groupings", () => {
    const gross = findMeasure(orders, "gross_amount")!; // dimensions: ["time"]
    expect(availableDimensionChoices(orders, gross).map((c) => c.id)).toEqual([null, "time"]);
    expect(chartChoices(orders, gross, "status")).toEqual([]);
  });

  it("the natural display per shape", () => {
    expect(defaultChartFor(orders, orderCount, null)).toBe("kpi");
    expect(defaultChartFor(orders, orderCount, "time")).toBe("line");
    expect(defaultChartFor(orders, orderCount, "status")).toBe("bar");
  });
});

describe("chart-type transitions", () => {
  it("Line → Bar keeps measure, grouping, filters, range and grain", () => {
    const { draft: next, resets } = reconcileInsightDraft(
      FIXTURE_CATALOG,
      draft({ chart: "bar" }),
    );
    expect(next.chart).toBe("bar");
    expect(next.dimension).toBe("time");
    expect(next.timeGrain).toBe("week");
    expect(next.filters["include_drafts"]).toBe(true);
    expect(resets).toEqual([]);
  });

  it("Bar → Table over time preserves the whole question", () => {
    const { draft: next, resets } = reconcileInsightDraft(
      FIXTURE_CATALOG,
      draft({ chart: "table" }),
    );
    expect(next.chart).toBe("table");
    expect(next.dimension).toBe("time");
    expect(resets).toEqual([]);
  });

  it("Line → KPI clears only time-series-only config, with explanations", () => {
    const { draft: next, resets } = reconcileInsightDraft(
      FIXTURE_CATALOG,
      draft({
        dimension: null,
        series: { by: "item", mode: "explicit", ids: ["i-1"] },
        chart: null,
      }),
    );
    expect(next.chart).toBe("kpi");
    expect(next.timeGrain).toBe("auto");
    expect(next.series).toBeNull();
    expect(next.filters["include_drafts"]).toBe(true); // still valid → kept
    expect(resets.some((r) => r.field === "series")).toBe(true);
    expect(resets.some((r) => r.field === "timeGrain")).toBe(true);
  });

  it("Bar/Table → Donut is allowed on a part-to-whole grouping and drops sorting", () => {
    const { draft: next } = reconcileInsightDraft(
      FIXTURE_CATALOG,
      draft({
        dimension: "status",
        chart: "donut",
        sort: { by: "value", dir: "desc" },
        series: null,
        timeGrain: "auto",
      }),
    );
    expect(next.chart).toBe("donut");
    expect(next.dimension).toBe("status");
    expect(next.sort).toBeNull(); // a whole isn't re-ordered
  });

  it("Donut on a non-part-to-whole grouping is cleared WITH the reason", () => {
    const { draft: next, resets } = reconcileInsightDraft(
      FIXTURE_CATALOG,
      draft({ dimension: "item", chart: "donut", series: null, timeGrain: "auto" }),
    );
    expect(next.chart).toBe("bar"); // natural display for a category breakdown
    const note = resets.find((r) => r.field === "chart");
    expect(note?.message).toMatch(/add up to a meaningful whole/);
  });

  it("Donut → Line restores a time question, keeping measure and filters", () => {
    const { draft: next, resets } = reconcileInsightDraft(
      FIXTURE_CATALOG,
      draft({ dimension: "time", chart: "line", sort: { by: "value", dir: "desc" } }),
    );
    expect(next.chart).toBe("line");
    expect(next.measure).toBe("order_count");
    expect(next.filters["include_drafts"]).toBe(true);
    // Ordering was a category-only concept — cleared with an explanation.
    expect(next.sort).toBeNull();
    expect(resets.some((r) => r.field === "sort")).toBe(true);
  });

  it("changing to a measure that can't use the category clears grouping AND chart", () => {
    const { draft: next, resets } = reconcileInsightDraft(
      FIXTURE_CATALOG,
      draft({
        dimension: "status",
        chart: "donut",
        measure: "gross_amount", // dimensions: ["time"] only
        series: null,
        timeGrain: "auto",
      }),
    );
    expect(next.dimension).not.toBe("status");
    expect(next.chart).not.toBe("donut");
    expect(resets.some((r) => r.field === "dimension")).toBe(true);
  });

  it("sorting survives while the grouping stays categorical", () => {
    const { draft: next, resets } = reconcileInsightDraft(
      FIXTURE_CATALOG,
      draft({
        dimension: "item",
        chart: "bar",
        sort: { by: "value", dir: "desc" },
        series: null,
        timeGrain: "auto",
      }),
    );
    expect(next.sort).toEqual({ by: "value", dir: "desc" });
    expect(resets).toEqual([]);
  });

  it("no transition silently substitutes a different question", () => {
    const before = draft({ dimension: "status", chart: "bar", series: null, timeGrain: "auto" });
    const { draft: next } = reconcileInsightDraft(FIXTURE_CATALOG, {
      ...before,
      chart: "donut",
    });
    // Only the display changed; measure/dimension/filters/range are identical.
    expect(next.measure).toBe(before.measure);
    expect(next.dimension).toBe(before.dimension);
    expect(next.filters).toEqual(before.filters);
    expect(next.range).toEqual(before.range);
  });
});

describe("query construction for the new shapes", () => {
  it("a categorical bar persists + sends sort, never series/grain", () => {
    const config = insightConfigFromDraft(
      draft({
        dimension: "status",
        chart: "bar",
        sort: { by: "value", dir: "desc" },
        series: null,
        timeGrain: "auto",
      }),
    )!;
    expect(config.sort).toEqual({ by: "value", dir: "desc" });
    expect(config.series).toBeUndefined();
    expect(config.timeGrain).toBeUndefined();
    expect(insightQueryFromConfig(config)).toMatchObject({
      dimension: "status",
      chart: "bar",
      sort: { by: "value", dir: "desc" },
    });
  });

  it("locally invalid chart/shape pairs are never sent", () => {
    expect(insightConfigFromDraft(draft({ chart: "donut", dimension: "time" }))).toBeNull();
    expect(insightConfigFromDraft(draft({ chart: "donut", dimension: null }))).toBeNull();
    expect(insightConfigFromDraft(draft({ chart: "bar", dimension: null }))).toBeNull();
    expect(insightConfigFromDraft(draft({ chart: "kpi", dimension: "status" }))).toBeNull();
  });

  it("a saved CD-3B config round-trips through the draft unchanged", () => {
    const config = insightConfigFromDraft(
      draft({
        dimension: "status",
        chart: "donut",
        series: null,
        timeGrain: "auto",
      }),
    )!;
    const rehydrated = reconcileInsightDraft(
      FIXTURE_CATALOG,
      insightDraftFromConfig(config),
    );
    expect(rehydrated.resets).toEqual([]);
    expect(insightConfigFromDraft(rehydrated.draft)).toEqual(config);
  });
});
