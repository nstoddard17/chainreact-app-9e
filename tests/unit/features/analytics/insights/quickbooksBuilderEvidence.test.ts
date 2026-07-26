/**
 * ANALYTICS-CONNECTED-DATA-CD-4B — generic-builder evidence.
 *
 * Proves the QuickBooks Invoices experience is produced ENTIRELY by the
 * catalog declaration: the same pure selectors the builder UI calls
 * (insightCatalog.ts) are driven by the real client projection, with no
 * QuickBooks-specific branch anywhere. If the builder needed provider-specific
 * React to render this dataset, these assertions could not hold.
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
  seriesDimension,
  supportsTime,
} from "@/features/analytics/insights/insightCatalog";

const catalog = buildClientAnalyticsCatalog({ environment: "production" });
const source = catalog.sources.find((s) => s.id === "quickbooks")!;
const dataset = source.datasets.find((d) => d.id === "invoices")!;
const measure = (id: string) => findMeasure(dataset, id)!;

describe("the catalog alone puts QuickBooks in the builder", () => {
  it("offers QuickBooks as a connectable source in production", () => {
    expect(source).toBeTruthy();
    expect(source.label).toBe("QuickBooks");
    expect(source.providerId).toBe("quickbooks");
    expect(source.connectionRequired).toBe(true);
  });

  it("offers the Invoices dataset", () => {
    expect(dataset).toBeTruthy();
    expect(dataset.label).toBe("Invoices");
  });

  it("offers all five measures as plain-language choices", () => {
    expect(dataset.measures.map((m) => m.label)).toEqual(
      expect.arrayContaining([
        "Invoice count",
        "Total invoiced amount",
        "Average invoice amount",
        "Outstanding balance",
        "Outstanding invoices",
      ]),
    );
  });
});

describe("historical controls appear only for historical-compatible measures", () => {
  it.each(["invoice_count", "total_invoiced_amount", "avg_invoice_amount"])(
    "%s offers Over time",
    (id) => {
      expect(supportsTime(dataset, measure(id))).toBe(true);
      expect(availableDimensionChoices(dataset, measure(id)).map((c) => c.id)).toContain(
        "time",
      );
    },
  );

  it.each(["outstanding_balance", "outstanding_invoice_count"])(
    "%s offers NO time control at all",
    (id) => {
      expect(supportsTime(dataset, measure(id))).toBe(false);
      const choices = availableDimensionChoices(dataset, measure(id)).map((c) => c.id);
      expect(choices).not.toContain("time");
      expect(chartChoices(dataset, measure(id), "time")).not.toContain("line");
    },
  );

  it("outstanding balance can still be a KPI or a breakdown by customer", () => {
    const choices = availableDimensionChoices(dataset, measure("outstanding_balance"));
    expect(choices.map((c) => c.id)).toEqual([null, "customer"]);
    expect(choices.map((c) => c.label)).toEqual([
      "No grouping — one number",
      "By customer",
    ]);
  });
});

describe("chart choices are derived, never provider-branched", () => {
  it("gives invoice count the full launch set for each shape", () => {
    const m = measure("invoice_count");
    expect(chartChoices(dataset, m, null)).toEqual(["kpi", "table"]);
    expect(chartChoices(dataset, m, "time")).toEqual(["line", "bar", "table"]);
    expect(chartChoices(dataset, m, "customer")).toEqual(["bar", "table"]);
    // Donut ONLY on the declared part-to-whole dimension.
    expect(chartChoices(dataset, m, "paid_status")).toEqual(["bar", "table", "donut"]);
  });

  it("never offers a donut for a money measure", () => {
    for (const id of ["total_invoiced_amount", "avg_invoice_amount", "outstanding_balance"]) {
      for (const dim of [null, "time", "customer", "paid_status"]) {
        expect(chartChoices(dataset, measure(id), dim)).not.toContain("donut");
      }
    }
  });

  it("treats only paid status as part-to-whole", () => {
    expect(isPartToWhole(dataset, "paid_status")).toBe(true);
    expect(isPartToWhole(dataset, "customer")).toBe(false);
    expect(isPartToWhole(dataset, "currency")).toBe(false);
    expect(isPartToWhole(dataset, null)).toBe(false);
  });

  it("defaults each shape to its natural display", () => {
    const m = measure("total_invoiced_amount");
    expect(defaultChartFor(dataset, m, null)).toBe("kpi");
    expect(defaultChartFor(dataset, m, "time")).toBe("line");
    expect(defaultChartFor(dataset, m, "customer")).toBe("bar");
    expect(defaultChartFor(dataset, measure("outstanding_balance"), "customer")).toBe("bar");
  });
});

describe("pickers and filters come from the declaration", () => {
  it("gives every measure a customer picker backed by the QuickBooks resolver", () => {
    const filters = availableFilters(dataset, measure("invoice_count"));
    const customer = filters.find((f) => f.id === "customer")!;
    expect(customer.valueType).toBe("entity_ids");
    expect(customer.optionsSource).toBe("quickbooks:customers");
    expect(customer.maxSelections).toBe(1);
  });

  it("offers paid status as a declared value list, so no ids are typed by hand", () => {
    const status = availableFilters(dataset, measure("invoice_count")).find(
      (f) => f.id === "paid_status",
    )!;
    expect(status.values).toEqual([
      { id: "outstanding", label: "Outstanding" },
      { id: "paid", label: "Paid" },
    ]);
  });

  it("offers customer and paid-status series for a count over time", () => {
    expect(availableSeries(dataset, measure("invoice_count")).map((s) => s.by).sort()).toEqual(
      ["customer", "paid_status"],
    );
    // A money measure splits by customer but not by paid status (it declares
    // no paid_status dimension, so the split would be meaningless).
    expect(
      availableSeries(dataset, measure("total_invoiced_amount")).map((s) => s.by),
    ).toEqual(["customer"]);
  });

  it("can never reach the series step for a current-state measure", () => {
    // The builder renders the Series step only when the grouping is "time"
    // (InsightBuilder.tsx) and the server rejects series off time
    // (validateQuery.ts). Outstanding balance offers no time grouping at all,
    // so series are unreachable for it — no QuickBooks-specific rule needed.
    for (const id of ["outstanding_balance", "outstanding_invoice_count"]) {
      expect(supportsTime(dataset, measure(id))).toBe(false);
      expect(availableDimensionChoices(dataset, measure(id)).map((c) => c.id)).not.toContain(
        "time",
      );
    }
  });

  it("caps customer series at 8 and routes its picker to the same resolver", () => {
    const cap = availableSeries(dataset, measure("invoice_count")).find(
      (s) => s.by === "customer",
    )!;
    expect(cap.max).toBe(8);
    expect(seriesDimension(dataset, cap)!.optionsSource).toBe("quickbooks:customers");
  });
});

describe("the six launch questions are all expressible", () => {
  it.each([
    ["Invoice count by month", "invoice_count", "time", "line"],
    ["Total invoiced amount by week", "total_invoiced_amount", "time", "line"],
    ["Average invoice amount as a KPI", "avg_invoice_amount", null, "kpi"],
    ["Outstanding balance by customer", "outstanding_balance", "customer", "bar"],
    ["Invoice count by paid status", "invoice_count", "paid_status", "donut"],
    ["Outstanding balance as a KPI", "outstanding_balance", null, "kpi"],
  ])("%s", (_label, measureId, dimension, chart) => {
    const m = measure(measureId);
    expect(availableDimensionChoices(dataset, m).map((c) => c.id)).toContain(dimension);
    expect(chartChoices(dataset, m, dimension)).toContain(chart);
  });
});

describe("no client-side provider knowledge", () => {
  it("keeps scopes, execution mode and provider internals out of the browser payload", () => {
    const json = JSON.stringify(catalog);
    for (const secret of [
      "com.intuit", "quickbooks.api", "realm", "minorversion",
      "STARTPOSITION", "provider_snapshot", "MetaData",
    ]) {
      expect(json).not.toContain(secret);
    }
  });

  it("hides the non-historical due-date field from time controls", () => {
    expect(dataset.dateFields.map((d) => d.id)).toEqual(["txn_date"]);
  });
});
