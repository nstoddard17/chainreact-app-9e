import {
  ConnectedRefineSchema,
  type ConnectedAnalyticsQuery,
  type ConnectedAnalyticsResult,
} from "@/contracts/connectedAnalytics";
import {
  AnalyticsSourceCatalogSchema,
  type AnalyticsSourceCatalog,
} from "@/contracts/analyticsCatalog";
import { deriveDatasetCapabilities } from "@/contracts/analyticsCatalogDerive";
import { attachInsightRefinements } from "@/services/analytics/insights/attachRefinements";
import type { RegisteredDataset } from "@/services/analytics/insights/registry";

/**
 * CD-5B — server-issued drill refinements.
 *
 * The load-bearing claims: a refinement exists ONLY when the catalog proves
 * the row/series id is a canonical filter value; surrogate-keyed and undeclared
 * categories stay plain values; the schema itself cannot represent anything
 * dangerous; and snapshots are unaffected because attachment happens after the
 * cache (pinned in the pipeline suites — here we pin the pure function).
 *
 * A FICTIONAL catalog drives everything: if this only worked for a real
 * provider, there'd be a provider branch somewhere.
 */

const CATALOG: AnalyticsSourceCatalog = AnalyticsSourceCatalogSchema.parse({
  source: {
    id: "acme",
    providerId: "acme",
    label: "Acme",
    credentialMode: "account",
    connectionRequired: true,
    exposure: "public",
  },
  datasets: [
    {
      id: "orders",
      label: "Orders",
      recordNoun: "orders",
      fields: [
        {
          id: "status",
          label: "Status",
          kind: "category",
          dimensionable: true,
          cardinality: "low",
          filterable: true,
          values: [
            { id: "paid", label: "Paid" },
            { id: "void", label: "Void" },
          ],
        },
        {
          id: "currency",
          label: "Currency",
          kind: "category",
          dimensionable: true,
          cardinality: "bounded",
          filterable: true,
          // No declared values — account-specific domain. Not drillable.
        },
        {
          id: "thing",
          label: "Thing",
          kind: "entity",
          dimensionable: true,
          cardinality: "bounded",
          filterable: true,
          optionsSource: null,
          // Result ids ARE the filter values (the ChainReact-workflow shape).
          resultIdsAreFilterValues: true,
        },
        {
          id: "vendor",
          label: "Vendor",
          kind: "entity",
          dimensionable: true,
          cardinality: "bounded",
          filterable: true,
          optionsSource: null,
          // Surrogate-keyed rows (the QuickBooks-customer shape): NOT opted in.
        },
      ],
      dateFields: [{ id: "created", label: "Created", historical: true }],
      namedMeasures: [
        {
          id: "order_count",
          label: "Orders",
          unit: "count",
          emptyValue: "zero",
          compare: true,
        },
        {
          id: "paid_count",
          label: "Paid orders",
          unit: "count",
          emptyValue: "zero",
          incompatibleFilters: ["status"],
          compare: true,
        },
      ],
      deriveCount: false,
      supportedCharts: ["kpi", "line", "bar", "table", "donut"],
      partToWholeDimensions: ["status"],
      queryLimits: { maxRangeDays: 366, maxBuckets: 400, maxCategoryRows: 50 },
      freshness: { mode: "cached", ttlSeconds: 600 },
      executionMode: "provider_snapshot",
    },
  ],
});

const dataset = CATALOG.datasets[0]!;
const REG: RegisteredDataset = {
  catalog: CATALOG,
  dataset,
  capabilities: deriveDatasetCapabilities(dataset),
  adapter: { sourceId: "acme", datasetId: "orders", requiredScopes: [], query: jest.fn() },
};

function query(overrides: Partial<ConnectedAnalyticsQuery> = {}): ConnectedAnalyticsQuery {
  return {
    source: "acme",
    dataset: "orders",
    measure: "order_count",
    dimension: "status",
    range: { preset: "30d" },
    ...overrides,
  };
}

function categorical(
  rows: { id: string; label: string; value: number | null }[],
  dimension = "status",
): ConnectedAnalyticsResult {
  return {
    kind: "categorical",
    source: { sourceId: "acme", sourceLabel: "Acme", datasetId: "orders", datasetLabel: "Orders" },
    measure: { id: "order_count", label: "Orders" },
    dimension,
    grain: null,
    range: { from: "2026-06-01T00:00:00.000Z", to: "2026-07-01T00:00:00.000Z" },
    valueMeta: { unit: "count" },
    freshness: { mode: "cached" },
    completeness: { state: "complete" },
    rows,
    warnings: [],
  };
}

describe("bounded category dimensions", () => {
  it("attaches a refinement only to rows whose id is a DECLARED value", () => {
    const out = attachInsightRefinements(
      REG,
      query(),
      categorical([
        { id: "paid", label: "Paid", value: 5 },
        { id: "mystery", label: "Mystery", value: 2 }, // outside the declared domain
      ]),
    );
    expect(out.rows![0]!.refine).toEqual({
      filterKey: "status",
      filterValue: "paid",
      label: "Paid",
    });
    expect(out.rows![1]!.refine).toBeUndefined();
  });

  it("uses the catalog's declared label, never trusted row text", () => {
    const out = attachInsightRefinements(
      REG,
      query(),
      categorical([{ id: "paid", label: '=HYPERLINK("evil")', value: 5 }]),
    );
    expect(out.rows![0]!.refine!.label).toBe("Paid");
  });

  it("never attaches for a category with no declared values (currency shape)", () => {
    const out = attachInsightRefinements(
      REG,
      query({ dimension: "currency" }),
      categorical([{ id: "usd", label: "USD", value: 5 }], "currency"),
    );
    expect(out.rows![0]!.refine).toBeUndefined();
  });
});

describe("entity dimensions", () => {
  it("attaches for an entity that declares resultIdsAreFilterValues", () => {
    const out = attachInsightRefinements(
      REG,
      query({ dimension: "thing" }),
      categorical([{ id: "wf-123", label: "Daily digest", value: 5 }], "thing"),
    );
    expect(out.rows![0]!.refine).toEqual({
      filterKey: "thing",
      filterValue: "wf-123",
      label: "Daily digest",
    });
  });

  it("NEVER attaches for a surrogate-keyed entity (QuickBooks-customer shape)", () => {
    const out = attachInsightRefinements(
      REG,
      query({ dimension: "vendor" }),
      categorical([{ id: "a1b2c3d4e5f60708", label: "Acme Corp", value: 5 }], "vendor"),
    );
    expect(out.rows![0]!.refine).toBeUndefined();
  });
});

describe("measure incompatibility", () => {
  it("withholds refinements the current measure's filters would reject", () => {
    const out = attachInsightRefinements(
      REG,
      query({ measure: "paid_count" }), // declares incompatibleFilters: ["status"]
      categorical([{ id: "paid", label: "Paid", value: 5 }]),
    );
    expect(out.rows![0]!.refine).toBeUndefined();
  });
});

describe("series refinements", () => {
  it("attaches to series entries by the same rules", () => {
    const result: ConnectedAnalyticsResult = {
      ...categorical([]),
      kind: "time_series",
      dimension: "time",
      grain: "day",
      buckets: [{ start: "2026-06-01T00:00:00.000Z", end: "2026-06-02T00:00:00.000Z", label: "Jun 1" }],
      series: [
        { id: "paid", label: "Paid", values: [3] },
        { id: "mystery", label: "Mystery", values: [1] },
      ],
      rows: undefined,
    };
    const out = attachInsightRefinements(
      REG,
      query({ dimension: "time", series: { by: "status" } }),
      result,
    );
    expect(out.series![0]!.refine?.filterValue).toBe("paid");
    expect(out.series![1]!.refine).toBeUndefined();
  });
});

describe("shape safety", () => {
  it("leaves KPI and time-only results untouched (same reference)", () => {
    const kpi: ConnectedAnalyticsResult = { ...categorical([]), kind: "kpi", dimension: null, rows: undefined, value: 7 };
    expect(attachInsightRefinements(REG, query({ dimension: null }), kpi)).toBe(kpi);
  });

  it("does not mutate the input result", () => {
    const input = categorical([{ id: "paid", label: "Paid", value: 5 }]);
    const before = JSON.stringify(input);
    attachInsightRefinements(REG, query(), input);
    expect(JSON.stringify(input)).toBe(before);
  });
});

describe("the refinement schema cannot represent anything dangerous", () => {
  it("accepts exactly filterKey/filterValue/label and nothing else", () => {
    expect(
      ConnectedRefineSchema.safeParse({ filterKey: "status", filterValue: "paid", label: "Paid" })
        .success,
    ).toBe(true);
    for (const extra of [
      { accountId: "a-1" },
      { integrationId: "i-1" },
      { connectionId: "c-1" },
      { scope: "read_write" },
      { endpoint: "/v1/x" },
      { cursor: "abc" },
      { query: "SELECT *" },
      { payload: {} },
    ]) {
      const parsed = ConnectedRefineSchema.safeParse({
        filterKey: "status",
        filterValue: "paid",
        label: "Paid",
        ...extra,
      });
      expect(parsed.success).toBe(false);
    }
  });

  it("bounds every string", () => {
    expect(
      ConnectedRefineSchema.safeParse({
        filterKey: "x".repeat(61),
        filterValue: "paid",
        label: "Paid",
      }).success,
    ).toBe(false);
    expect(
      ConnectedRefineSchema.safeParse({
        filterKey: "status",
        filterValue: "x".repeat(121),
        label: "Paid",
      }).success,
    ).toBe(false);
    expect(
      ConnectedRefineSchema.safeParse({
        filterKey: "status",
        filterValue: "paid",
        label: "x".repeat(121),
      }).success,
    ).toBe(false);
  });

  it("refuses oversized ids at attachment time too", () => {
    const out = attachInsightRefinements(
      REG,
      query({ dimension: "thing" }),
      categorical([{ id: "x".repeat(121), label: "Huge", value: 1 }], "thing"),
    );
    expect(out.rows![0]!.refine).toBeUndefined();
  });
});

describe("catalog guard rails", () => {
  it("rejects resultIdsAreFilterValues on non-entity or non-filterable fields", () => {
    const bad = (field: Record<string, unknown>) =>
      AnalyticsSourceCatalogSchema.safeParse({
        ...CATALOG,
        datasets: [
          {
            ...dataset,
            fields: [...dataset.fields, field],
          },
        ],
      }).success;
    expect(
      bad({
        id: "bad1",
        label: "Bad",
        kind: "category",
        filterable: true,
        resultIdsAreFilterValues: true,
      }),
    ).toBe(false);
    expect(
      bad({
        id: "bad2",
        label: "Bad",
        kind: "entity",
        optionsSource: null,
        filterable: false,
        resultIdsAreFilterValues: true,
      }),
    ).toBe(false);
  });
});
