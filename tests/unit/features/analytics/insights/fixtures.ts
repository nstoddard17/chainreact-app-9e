import type { ConnectedAnalyticsResult } from "@/contracts/connectedAnalytics";
import type { InsightCatalog } from "@/features/analytics/insights/insightCatalog";

/**
 * Generic fixture catalog for Custom Insight tests (CD-3A).
 *
 * Sources are deliberately NOT real providers ("acme", "internal_app") — the
 * builder must render them exactly like it renders ChainReact/Stripe, proving
 * there is no provider-name special-casing anywhere in the UI.
 */
export const FIXTURE_CATALOG: InsightCatalog = {
  sources: [
    {
      id: "acme",
      label: "Acme",
      description: "Orders from your Acme account.",
      credentialMode: "account",
      connectionRequired: true,
      exposure: "public",
      providerId: "acme",
      datasets: [
        {
          id: "orders",
          label: "Orders",
          description: "Orders placed in Acme.",
          measures: [
            {
              id: "order_count",
              label: "Orders",
              unit: "count",
              emptyValue: "zero",
              dimensions: null,
              incompatibleFilters: [],
              compare: true,
            },
            {
              id: "gross_amount",
              label: "Gross order amount",
              unit: "currency",
              emptyValue: "zero",
              dimensions: ["time"],
              incompatibleFilters: ["status"],
              compare: true,
            },
            {
              id: "avg_amount",
              label: "Average order amount",
              unit: "currency",
              emptyValue: "null",
              dimensions: ["time"],
              incompatibleFilters: ["status"],
              compare: false,
            },
          ],
          dimensions: [
            { id: "time", label: "Time", kind: "time" },
            { id: "status", label: "Status", kind: "category" },
            { id: "item", label: "Item", kind: "entity", optionsSource: "acme:items" },
          ],
          filters: [
            {
              id: "status",
              label: "Status",
              valueType: "category_values",
              maxSelections: 3,
              values: [
                { id: "paid", label: "Paid" },
                { id: "refunded", label: "Refunded" },
                { id: "void", label: "Void" },
              ],
            },
            { id: "currency", label: "Currency", valueType: "category_values", maxSelections: 5 },
            {
              id: "item",
              label: "Item",
              valueType: "entity_ids",
              optionsSource: "acme:items",
              maxSelections: 8,
            },
            { id: "include_drafts", label: "Include drafts", valueType: "boolean", maxSelections: 1 },
          ],
          dateFields: [{ id: "placed", label: "Order date" }],
          charts: ["kpi", "line", "bar", "table", "donut"],
          // Status is mutually exclusive + exhaustive → a genuine whole.
          partToWholeDimensions: ["status"],
          series: [
            { by: "item", max: 8, modes: ["explicit", "top"] },
            { by: "status", max: 3, modes: [] },
          ],
          compare: true,
          limits: { maxRangeDays: 90, maxCategoryRows: 50 },
          freshness: { mode: "cached", ttlSeconds: 600 },
          previewSafe: true,
        },
        {
          id: "audits",
          label: "Audit scans",
          description: "Heavy scans that should not auto-preview.",
          measures: [
            {
              id: "scan_count",
              label: "Scans",
              unit: "count",
              emptyValue: "zero",
              dimensions: null,
              incompatibleFilters: [],
              compare: false,
            },
          ],
          dimensions: [{ id: "time", label: "Time", kind: "time" }],
          filters: [],
          dateFields: [{ id: "ran", label: "Scan date" }],
          charts: ["kpi", "line"],
          partToWholeDimensions: [],
          series: [],
          compare: false,
          limits: { maxRangeDays: 366, maxCategoryRows: 50 },
          freshness: { mode: "cached", ttlSeconds: 600 },
          previewSafe: false,
        },
      ],
    },
    {
      id: "internal_app",
      label: "Internal App",
      description: "Built-in activity.",
      credentialMode: "internal",
      connectionRequired: false,
      exposure: "public",
      providerId: null,
      datasets: [
        {
          id: "events",
          label: "Events",
          measures: [
            {
              id: "event_count",
              label: "Events",
              unit: "count",
              emptyValue: "zero",
              dimensions: null,
              incompatibleFilters: [],
              compare: true,
            },
          ],
          dimensions: [
            { id: "time", label: "Time", kind: "time" },
            { id: "thing", label: "Thing", kind: "entity", optionsSource: null },
          ],
          filters: [
            {
              id: "thing",
              label: "Thing",
              valueType: "entity_ids",
              optionsSource: null,
              maxSelections: 8,
            },
          ],
          dateFields: [{ id: "at", label: "Event time" }],
          charts: ["kpi", "line", "bar", "table"],
          partToWholeDimensions: [],
          series: [{ by: "thing", max: 8, modes: ["explicit", "top"] }],
          compare: true,
          limits: { maxRangeDays: 366, maxCategoryRows: 50 },
          freshness: { mode: "live", ttlSeconds: 0 },
          previewSafe: true,
        },
      ],
    },
    {
      id: "previewsrc",
      label: "Preview Source",
      credentialMode: "account",
      connectionRequired: true,
      exposure: "preview",
      providerId: "previewsrc",
      datasets: [
        {
          id: "things",
          label: "Things",
          measures: [
            {
              id: "thing_count",
              label: "Things",
              unit: "count",
              emptyValue: "zero",
              dimensions: null,
              incompatibleFilters: [],
              compare: false,
            },
          ],
          dimensions: [{ id: "time", label: "Time", kind: "time" }],
          filters: [],
          dateFields: [{ id: "at", label: "Date" }],
          charts: ["kpi", "line"],
          partToWholeDimensions: [],
          series: [],
          compare: false,
          limits: { maxRangeDays: 366, maxCategoryRows: 50 },
          freshness: { mode: "cached", ttlSeconds: 600 },
          previewSafe: true,
        },
      ],
    },
  ],
};

export function kpiResult(
  overrides: Partial<ConnectedAnalyticsResult> = {},
): ConnectedAnalyticsResult {
  return {
    kind: "kpi",
    source: {
      sourceId: "acme",
      sourceLabel: "Acme",
      datasetId: "orders",
      datasetLabel: "Orders",
    },
    measure: { id: "order_count", label: "Orders" },
    dimension: null,
    grain: null,
    range: { from: "2026-06-01T00:00:00.000Z", to: "2026-07-01T00:00:00.000Z" },
    valueMeta: { unit: "count" },
    freshness: { mode: "cached", ageSeconds: 300, ttlSeconds: 600 },
    completeness: { state: "complete" },
    value: 1234,
    warnings: [],
    ...overrides,
  };
}

export function timeSeriesResult(
  overrides: Partial<ConnectedAnalyticsResult> = {},
): ConnectedAnalyticsResult {
  return {
    kind: "time_series",
    source: {
      sourceId: "acme",
      sourceLabel: "Acme",
      datasetId: "orders",
      datasetLabel: "Orders",
    },
    measure: { id: "order_count", label: "Orders" },
    dimension: "time",
    grain: "day",
    range: { from: "2026-06-01T00:00:00.000Z", to: "2026-06-04T00:00:00.000Z" },
    valueMeta: { unit: "count" },
    freshness: { mode: "live" },
    completeness: { state: "complete" },
    buckets: [
      { start: "2026-06-01", end: "2026-06-02", label: "Jun 1" },
      { start: "2026-06-02", end: "2026-06-03", label: "Jun 2" },
      { start: "2026-06-03", end: "2026-06-04", label: "Jun 3" },
    ],
    series: [{ id: "all", label: "Orders", values: [3, 0, 5] }],
    warnings: [],
    ...overrides,
  };
}

export function categoricalResult(
  overrides: Partial<ConnectedAnalyticsResult> = {},
): ConnectedAnalyticsResult {
  return {
    kind: "categorical",
    source: {
      sourceId: "acme",
      sourceLabel: "Acme",
      datasetId: "orders",
      datasetLabel: "Orders",
    },
    measure: { id: "order_count", label: "Orders" },
    dimension: "status",
    grain: null,
    range: { from: "2026-06-01T00:00:00.000Z", to: "2026-07-01T00:00:00.000Z" },
    valueMeta: { unit: "count" },
    freshness: { mode: "live" },
    completeness: { state: "complete" },
    rows: [
      { id: "paid", label: "Paid", value: 60, records: 60 },
      { id: "refunded", label: "Refunded", value: 30, records: 30 },
      { id: "void", label: "Void", value: 10, records: 10 },
    ],
    total: 100,
    warnings: [],
    ...overrides,
  };
}
