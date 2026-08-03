/** @jest-environment node */
/**
 * ANALYTICS-CONNECTED-DATA-CD-4C — generic-builder evidence.
 *
 * Proves the Shopify Orders experience is produced ENTIRELY by the catalog
 * declaration: the same pure selectors the builder UI calls
 * (insightCatalog.ts) are driven by the real client projection, with no
 * Shopify-specific branch anywhere.
 */
import { buildClientAnalyticsCatalog } from "@/services/analytics/insights/clientProjection";
import {
  availableDimensionChoices,
  availableFilters,
  availableSeries,
  chartChoices,
  defaultChartFor,
  findMeasure,
  isPartToWhole,
  supportsTime,
} from "@/features/analytics/insights/insightCatalog";

const catalog = buildClientAnalyticsCatalog({ environment: "production" });
const source = catalog.sources.find((s) => s.id === "shopify")!;
const dataset = source.datasets.find((d) => d.id === "orders")!;
const measure = (id: string) => findMeasure(dataset, id)!;

describe("the catalog alone puts Shopify in the builder", () => {
  it("offers Shopify as a connectable public source in production", () => {
    expect(source).toBeTruthy();
    expect(source.label).toBe("Shopify");
    expect(source.providerId).toBe("shopify");
    expect(source.connectionRequired).toBe(true);
  });

  it("offers the Orders dataset with the four measures in plain language", () => {
    expect(dataset.label).toBe("Orders");
    expect(dataset.measures.map((m) => m.label)).toEqual(
      expect.arrayContaining([
        "Order count",
        "Paid order count",
        "Total order amount",
        "Average order amount",
      ]),
    );
  });
});

describe("groupings derive from the declaration", () => {
  it("order count groups over time, by both statuses, currency and cancellation", () => {
    const choices = availableDimensionChoices(dataset, measure("order_count"));
    expect(choices.map((c) => c.id)).toEqual([
      null, "time", "financial_status", "fulfillment_status", "currency", "cancellation_state",
    ]);
  });

  it("money measures group over time only — statuses remain filters", () => {
    for (const id of ["total_order_amount", "avg_order_amount"]) {
      expect(availableDimensionChoices(dataset, measure(id)).map((c) => c.id)).toEqual([
        null,
        "time",
      ]);
      expect(supportsTime(dataset, measure(id))).toBe(true);
    }
  });
});

describe("chart choices are derived, never provider-branched", () => {
  it("gives order count the full launch set for each shape", () => {
    const m = measure("order_count");
    expect(chartChoices(dataset, m, null)).toEqual(["kpi", "table"]);
    expect(chartChoices(dataset, m, "time")).toEqual(["line", "bar", "table"]);
    expect(chartChoices(dataset, m, "financial_status")).toEqual(["bar", "table", "donut"]);
    expect(chartChoices(dataset, m, "fulfillment_status")).toEqual(["bar", "table", "donut"]);
    expect(chartChoices(dataset, m, "cancellation_state")).toEqual(["bar", "table"]);
    expect(chartChoices(dataset, m, "currency")).toEqual(["bar", "table"]);
  });

  it("never offers a donut for a money measure", () => {
    for (const id of ["total_order_amount", "avg_order_amount", "paid_order_count"]) {
      for (const dim of [null, "time", "financial_status", "fulfillment_status", "currency"]) {
        expect(chartChoices(dataset, measure(id), dim)).not.toContain("donut");
      }
    }
  });

  it("treats only the two status partitions as part-to-whole", () => {
    expect(isPartToWhole(dataset, "financial_status")).toBe(true);
    expect(isPartToWhole(dataset, "fulfillment_status")).toBe(true);
    expect(isPartToWhole(dataset, "currency")).toBe(false);
    expect(isPartToWhole(dataset, "cancellation_state")).toBe(false);
  });

  it("defaults each shape to its natural display", () => {
    const m = measure("total_order_amount");
    expect(defaultChartFor(dataset, m, null)).toBe("kpi");
    expect(defaultChartFor(dataset, m, "time")).toBe("line");
    expect(defaultChartFor(dataset, measure("order_count"), "financial_status")).toBe("bar");
  });
});

describe("filters and series come from the declaration", () => {
  it("offers both status filters as declared value lists — no raw ids typed", () => {
    const filters = availableFilters(dataset, measure("order_count"));
    const fin = filters.find((f) => f.id === "financial_status")!;
    expect(fin.values!.map((v) => v.label)).toEqual([
      "Paid", "Pending", "Authorized", "Partially paid", "Partially refunded",
      "Refunded", "Voided", "Unknown",
    ]);
    const ful = filters.find((f) => f.id === "fulfillment_status")!;
    expect(ful.values!.map((v) => v.label)).toEqual([
      "Unfulfilled", "Partially fulfilled", "Fulfilled", "Restocked", "Unknown",
    ]);
  });

  it("offers the test-order toggle as a boolean filter", () => {
    const toggle = availableFilters(dataset, measure("order_count")).find(
      (f) => f.id === "include_test_orders",
    )!;
    expect(toggle.valueType).toBe("boolean");
    expect(toggle.label).toBe("Include test orders");
  });

  it("hides the financial-status filter from paid order count (contradiction)", () => {
    const filters = availableFilters(dataset, measure("paid_order_count"));
    expect(filters.some((f) => f.id === "financial_status")).toBe(false);
  });

  it("offers status series for order count only", () => {
    expect(availableSeries(dataset, measure("order_count")).map((s) => s.by)).toEqual([
      "financial_status",
      "fulfillment_status",
    ]);
    expect(availableSeries(dataset, measure("total_order_amount"))).toEqual([]);
    expect(availableSeries(dataset, measure("avg_order_amount"))).toEqual([]);
  });

  it("caps the series at the declared domain sizes", () => {
    const caps = availableSeries(dataset, measure("order_count"));
    expect(caps.find((c) => c.by === "financial_status")!.max).toBe(8);
    expect(caps.find((c) => c.by === "fulfillment_status")!.max).toBe(5);
  });
});

describe("the launch questions are all expressible", () => {
  it.each([
    ["Order count by day/week/month", "order_count", "time", "line"],
    ["Total order amount by week", "total_order_amount", "time", "line"],
    ["Average order amount as a KPI", "avg_order_amount", null, "kpi"],
    ["Order count by financial status", "order_count", "financial_status", "bar"],
    ["Order count by fulfillment status", "order_count", "fulfillment_status", "bar"],
    ["Order count donut by financial status", "order_count", "financial_status", "donut"],
  ])("%s", (_label, measureId, dimension, chart) => {
    const m = measure(measureId);
    expect(availableDimensionChoices(dataset, m).map((c) => c.id)).toContain(dimension);
    expect(chartChoices(dataset, m, dimension)).toContain(chart);
  });

  it("Total order amount for only paid orders = money + a paid filter", () => {
    const filters = availableFilters(dataset, measure("total_order_amount"));
    const fin = filters.find((f) => f.id === "financial_status")!;
    expect(fin.values!.some((v) => v.id === "paid")).toBe(true);
  });

  it("Order count with separate lines by financial status = the declared series", () => {
    expect(
      availableSeries(dataset, measure("order_count")).some((s) => s.by === "financial_status"),
    ).toBe(true);
  });
});

describe("no client-side provider knowledge", () => {
  it("keeps scopes, domains and provider internals out of the browser payload", () => {
    const json = JSON.stringify(catalog);
    for (const secret of [
      "read_orders", "myshopify", "page_info", "created_at_min", "provider_snapshot",
      "Link", "X-Shopify",
    ]) {
      expect(json).not.toContain(secret);
    }
  });
});
