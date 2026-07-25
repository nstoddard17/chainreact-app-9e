/**
 * ANALYTICS-CONNECTED-DATA-CD-1 — catalog field-model invariants + mechanical
 * capability derivation. Meaningless analytics must be unrepresentable.
 */
import {
  AnalyticsFieldSchema,
  AnalyticsSourceDefinitionSchema,
  type AnalyticsDataset,
} from "@/contracts/analyticsCatalog";
import { deriveDatasetCapabilities } from "@/contracts/analyticsCatalogDerive";

const field = (over: Record<string, unknown>) =>
  AnalyticsFieldSchema.safeParse({ id: "f1", label: "F1", kind: "number", ...over });

describe("AnalyticsFieldSchema — invalid states are unrepresentable", () => {
  it("only number fields are measurable, with allow-listed aggregations + unit", () => {
    expect(
      field({ kind: "entity", measurable: true, aggregations: ["sum"], unit: "count" }).success,
    ).toBe(false); // an id/entity can never be summed
    expect(field({ measurable: true }).success).toBe(false); // no aggregations
    expect(field({ measurable: true, aggregations: ["sum"] }).success).toBe(false); // no unit
    expect(
      field({ measurable: true, aggregations: ["sum", "avg"], unit: "currency", currencyBehavior: "single" }).success,
    ).toBe(true);
  });
  it("only bounded category/entity/boolean fields are dimensionable", () => {
    expect(field({ kind: "category", dimensionable: true }).success).toBe(false); // no cardinality
    expect(field({ kind: "category", dimensionable: true, cardinality: "high" }).success).toBe(false);
    expect(field({ kind: "category", dimensionable: true, cardinality: "low" }).success).toBe(true);
    expect(field({ dimensionable: true, cardinality: "low" }).success).toBe(false); // number
  });
  it("text fields are display-only; optionsSource is entity-only", () => {
    expect(field({ kind: "text", dimensionable: true, cardinality: "low" }).success).toBe(false);
    expect(field({ kind: "text", measurable: true, aggregations: ["sum"], unit: "count" }).success).toBe(false);
    expect(field({ kind: "category", optionsSource: "x:y", dimensionable: true, cardinality: "low" }).success).toBe(false);
  });
  it("unknown keys rejected; currencyBehavior requires currency unit", () => {
    expect(field({ sql: "SELECT 1" }).success).toBe(false);
    expect(field({ measurable: true, aggregations: ["sum"], unit: "count", currencyBehavior: "single" }).success).toBe(false);
  });
});

describe("AnalyticsSourceDefinitionSchema", () => {
  it("internal sources have no provider/connection; provider sources need providerId", () => {
    const base = { id: "s", label: "S" };
    expect(
      AnalyticsSourceDefinitionSchema.safeParse({
        ...base, providerId: null, credentialMode: "internal", connectionRequired: false,
      }).success,
    ).toBe(true);
    expect(
      AnalyticsSourceDefinitionSchema.safeParse({
        ...base, providerId: "stripe", credentialMode: "internal", connectionRequired: false,
      }).success,
    ).toBe(false);
    expect(
      AnalyticsSourceDefinitionSchema.safeParse({
        ...base, providerId: null, credentialMode: "account", connectionRequired: true,
      }).success,
    ).toBe(false);
  });
});

describe("deriveDatasetCapabilities", () => {
  const dataset: AnalyticsDataset = {
    id: "payments",
    label: "Payments",
    recordNoun: "payments",
    deriveCount: true,
    fields: [
      { id: "amount", label: "Amount", kind: "number", unit: "currency", currencyBehavior: "single", measurable: true, aggregations: ["sum", "avg"], nullable: false, dimensionable: false, filterable: false, distinctCountable: false },
      { id: "status", label: "Status", kind: "category", dimensionable: true, cardinality: "low", filterable: true, nullable: false, measurable: false, distinctCountable: false },
      { id: "customer", label: "Customer", kind: "entity", dimensionable: true, cardinality: "bounded", filterable: true, optionsSource: "stripe:customers", nullable: false, measurable: false, distinctCountable: true },
      { id: "memo", label: "Memo", kind: "text", nullable: true, measurable: false, dimensionable: false, filterable: false, distinctCountable: false },
    ],
    dateFields: [{ id: "created", label: "Created", historical: true }],
    namedMeasures: [
      { id: "net_revenue", label: "Net revenue", unit: "currency", emptyValue: "zero", compare: true },
    ],
    supportedCharts: ["kpi", "line", "bar", "table"],
    partToWholeDimensions: [],
    series: [],
    compare: true,
    queryLimits: { maxRangeDays: 366, maxBuckets: 400, maxCategoryRows: 50 },
    freshness: { mode: "cached", ttlSeconds: 600 },
    executionMode: "provider_snapshot",
    previewSafe: true,
    drilldown: false,
  };
  const caps = deriveDatasetCapabilities(dataset);

  it("derives count, sum/avg over measurable fields, distinct where declared, named measures", () => {
    expect(caps.measures.map((m) => m.id).sort()).toEqual(
      ["avg_amount", "count", "distinct_customer", "net_revenue", "sum_amount"].sort(),
    );
    const sum = caps.measures.find((m) => m.id === "sum_amount")!;
    expect(sum).toMatchObject({ unit: "currency", currencyBehavior: "single", emptyValue: "zero", origin: "derived" });
    expect(caps.measures.find((m) => m.id === "avg_amount")!.emptyValue).toBe("null");
  });
  it("derives time + bounded categorical/entity dimensions; text/number never dimension", () => {
    expect(caps.dimensions.map((d) => d.id).sort()).toEqual(["customer", "status", "time"].sort());
    expect(caps.dimensions.find((d) => d.id === "customer")!.optionsSource).toBe("stripe:customers");
  });
  it("derives typed filters with picker metadata", () => {
    expect(caps.filters.map((f) => f.id).sort()).toEqual(["customer", "status"].sort());
    expect(caps.filters.find((f) => f.id === "customer")).toMatchObject({
      valueType: "entity_ids", optionsSource: "stripe:customers", maxSelections: 20,
    });
  });
  it("no time dimension without a historical date field; count suppressible", () => {
    const snapshot = deriveDatasetCapabilities({
      ...dataset,
      deriveCount: false,
      dateFields: [{ id: "asof", label: "As of", historical: false }],
    });
    expect(snapshot.dimensions.some((d) => d.id === "time")).toBe(false);
    expect(snapshot.measures.some((m) => m.id === "count")).toBe(false);
  });
});
