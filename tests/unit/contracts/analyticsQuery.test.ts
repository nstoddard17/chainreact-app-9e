/**
 * ANALYTICS-FLEXIBILITY-CS-1 — strict request parsing + the canonical
 * capability matrix. Proves every supported measure×dimension cell validates,
 * every unsupported combination is REJECTED (never silently rewritten), and
 * the caps (series/filters/range) hold.
 */
import {
  ANALYTICS_QUERY_DEFAULT_CATEGORY_ROWS,
  ANALYTICS_QUERY_DEFAULT_TOP_N,
  AnalyticsQuerySchema,
  type AnalyticsQuery,
  type AnalyticsQueryDimension,
  type AnalyticsQueryMeasure,
} from "@/contracts/analyticsQuery";
import {
  ANALYTICS_MEASURE_CAPABILITIES,
  validateAnalyticsQuery,
} from "@/contracts/analyticsQueryCapabilities";

const WF_A = "11111111-1111-4111-8111-111111111111";
const WF_B = "22222222-2222-4222-8222-222222222222";

function parse(body: unknown) {
  return AnalyticsQuerySchema.safeParse(body);
}

function base(overrides: Partial<AnalyticsQuery> = {}): AnalyticsQuery {
  const parsed = AnalyticsQuerySchema.parse({
    measure: "runs",
    dimension: null,
    range: { preset: "7d" },
    ...overrides,
  });
  return parsed;
}

describe("AnalyticsQuerySchema — strict parsing", () => {
  it("parses a minimal KPI query and applies defaults", () => {
    const r = parse({ measure: "runs", dimension: null, range: { preset: "7d" } });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.filters.includeTests).toBe(false);
  });

  it("rejects unknown top-level keys", () => {
    const r = parse({
      measure: "runs",
      dimension: null,
      range: { preset: "7d" },
      sql: "DROP TABLE workflow_runs",
    });
    expect(r.success).toBe(false);
  });

  it("rejects unknown filter keys and non-enum values", () => {
    expect(
      parse({
        measure: "runs",
        dimension: null,
        range: { preset: "7d" },
        filters: { column: "status" },
      }).success,
    ).toBe(false);
    expect(
      parse({
        measure: "tasks_used",
        dimension: null,
        range: { preset: "7d" },
      }).success,
    ).toBe(false);
    expect(
      parse({
        measure: "runs",
        dimension: "error_category",
        range: { preset: "7d" },
      }).success,
    ).toBe(false);
  });

  it("caps workflow filters at 20 and series ids at 8", () => {
    const many = Array.from({ length: 21 }, (_, i) =>
      `${(i + 10).toString().padStart(8, "0")}-0000-4000-8000-000000000000`,
    );
    expect(
      parse({
        measure: "runs",
        dimension: null,
        range: { preset: "7d" },
        filters: { workflowIds: many },
      }).success,
    ).toBe(false);
    expect(
      parse({
        measure: "runs",
        dimension: "time",
        range: { preset: "7d" },
        series: { by: "workflow", mode: "explicit", ids: many.slice(0, 9) },
      }).success,
    ).toBe(false);
  });

  it("rejects a malformed custom range", () => {
    expect(
      parse({
        measure: "runs",
        dimension: null,
        range: { from: "not-a-date", to: "2026-07-01T00:00:00Z" },
      }).success,
    ).toBe(false);
  });
});

describe("validateAnalyticsQuery — capability matrix", () => {
  const MEASURES = Object.keys(
    ANALYTICS_MEASURE_CAPABILITIES,
  ) as AnalyticsQueryMeasure[];
  const DIMENSIONS: AnalyticsQueryDimension[] = [
    "time",
    "workflow",
    "status",
    "trigger_source",
  ];

  it("accepts every declared measure×dimension cell (and KPI for all)", () => {
    for (const measure of MEASURES) {
      expect(
        validateAnalyticsQuery(base({ measure, dimension: null })).ok,
      ).toBe(true);
      for (const dimension of ANALYTICS_MEASURE_CAPABILITIES[measure].dimensions) {
        const v = validateAnalyticsQuery(base({ measure, dimension }));
        expect({ measure, dimension, ok: v.ok }).toEqual({
          measure,
          dimension,
          ok: true,
        });
      }
    }
  });

  it("rejects every undeclared measure×dimension cell", () => {
    for (const measure of MEASURES) {
      const allowed = ANALYTICS_MEASURE_CAPABILITIES[measure].dimensions;
      for (const dimension of DIMENSIONS.filter((d) => !allowed.includes(d))) {
        const v = validateAnalyticsQuery(base({ measure, dimension }));
        expect({ measure, dimension, ok: v.ok }).toEqual({
          measure,
          dimension,
          ok: false,
        });
      }
    }
  });

  it("rejects success rate grouped by status (canonical example)", () => {
    const v = validateAnalyticsQuery(
      base({ measure: "success_rate", dimension: "status" }),
    );
    expect(v.ok).toBe(false);
  });

  it("rejects series when the dimension is not time", () => {
    const v = validateAnalyticsQuery(
      base({
        measure: "runs",
        dimension: "workflow",
        series: { by: "workflow", mode: "top", topN: 3 },
      }),
    );
    expect(v.ok).toBe(false);
  });

  it("rejects a time grain when the dimension is not time", () => {
    const v = validateAnalyticsQuery(
      base({ measure: "runs", dimension: "workflow", timeGrain: "week" }),
    );
    expect(v.ok).toBe(false);
  });

  it("rejects sort/limit outside categorical dimensions", () => {
    expect(
      validateAnalyticsQuery(
        base({ measure: "runs", dimension: "time", sort: { by: "value", dir: "desc" } }),
      ).ok,
    ).toBe(false);
    expect(
      validateAnalyticsQuery(base({ measure: "runs", dimension: null, limit: 5 })).ok,
    ).toBe(false);
  });

  it("series: status series take no mode/ids; workflow series need a valid mode", () => {
    expect(
      validateAnalyticsQuery(
        base({
          measure: "runs",
          dimension: "time",
          series: { by: "status" },
        }),
      ).ok,
    ).toBe(true);
    expect(
      validateAnalyticsQuery(
        base({
          measure: "runs",
          dimension: "time",
          series: { by: "status", topN: 3 },
        }),
      ).ok,
    ).toBe(false);
    expect(
      validateAnalyticsQuery(
        base({ measure: "runs", dimension: "time", series: { by: "workflow" } }),
      ).ok,
    ).toBe(false);
    expect(
      validateAnalyticsQuery(
        base({
          measure: "runs",
          dimension: "time",
          series: { by: "workflow", mode: "explicit", ids: [WF_A, WF_B] },
        }),
      ).ok,
    ).toBe(true);
  });

  it("series: success_rate can't be split by status; runs can", () => {
    expect(
      validateAnalyticsQuery(
        base({ measure: "success_rate", dimension: "time", series: { by: "status" } }),
      ).ok,
    ).toBe(false);
    expect(
      validateAnalyticsQuery(
        base({ measure: "runs", dimension: "time", series: { by: "status" } }),
      ).ok,
    ).toBe(true);
  });

  it("explicit workflow series reject a separate workflow filter; Top-N allows it", () => {
    expect(
      validateAnalyticsQuery(
        base({
          measure: "runs",
          dimension: "time",
          series: { by: "workflow", mode: "explicit", ids: [WF_A] },
          filters: { workflowIds: [WF_A, WF_B], includeTests: false },
        }),
      ).ok,
    ).toBe(false);
    expect(
      validateAnalyticsQuery(
        base({
          measure: "runs",
          dimension: "time",
          series: { by: "workflow", mode: "top", topN: 3 },
          filters: { workflowIds: [WF_A, WF_B], includeTests: false },
        }),
      ).ok,
    ).toBe(true);
  });

  it("status filter is rejected for status-fixed measures", () => {
    for (const measure of ["succeeded_runs", "failed_runs", "success_rate"] as const) {
      expect(
        validateAnalyticsQuery(
          base({
            measure,
            dimension: null,
            filters: { statuses: ["failed"], includeTests: false },
          }),
        ).ok,
      ).toBe(false);
    }
    expect(
      validateAnalyticsQuery(
        base({
          measure: "runs",
          dimension: null,
          filters: { statuses: ["failed"], includeTests: false },
        }),
      ).ok,
    ).toBe(true);
  });

  it("compare: KPI and single-series time only; multi-series rejected", () => {
    expect(
      validateAnalyticsQuery(
        base({ measure: "runs", dimension: null, compare: "previous_period" }),
      ).ok,
    ).toBe(true);
    expect(
      validateAnalyticsQuery(
        base({ measure: "runs", dimension: "time", compare: "previous_period" }),
      ).ok,
    ).toBe(true);
    expect(
      validateAnalyticsQuery(
        base({
          measure: "runs",
          dimension: "time",
          series: { by: "status" },
          compare: "previous_period",
        }),
      ).ok,
    ).toBe(false);
    expect(
      validateAnalyticsQuery(
        base({ measure: "runs", dimension: "workflow", compare: "previous_period" }),
      ).ok,
    ).toBe(false);
  });

  it("custom range: from must precede to; span capped at 366 days", () => {
    expect(
      validateAnalyticsQuery(
        base({
          range: { from: "2026-07-02T00:00:00Z", to: "2026-07-01T00:00:00Z" },
        }),
      ).ok,
    ).toBe(false);
    expect(
      validateAnalyticsQuery(
        base({
          range: { from: "2025-01-01T00:00:00Z", to: "2026-06-01T00:00:00Z" },
        }),
      ).ok,
    ).toBe(false);
    expect(
      validateAnalyticsQuery(
        base({
          range: { from: "2026-01-01T00:00:00Z", to: "2026-06-01T00:00:00Z" },
        }),
      ).ok,
    ).toBe(true);
  });

  it("normalization: defaults applied (grain auto, topN, categorical sort/limit)", () => {
    const time = validateAnalyticsQuery(base({ measure: "runs", dimension: "time" }));
    expect(time.ok && time.query.timeGrain).toBe("auto");

    const top = validateAnalyticsQuery(
      base({
        measure: "runs",
        dimension: "time",
        series: { by: "workflow", mode: "top" },
      }),
    );
    expect(
      top.ok && top.query.series?.by === "workflow" && top.query.series.mode === "top"
        ? top.query.series.topN
        : null,
    ).toBe(ANALYTICS_QUERY_DEFAULT_TOP_N);

    const cat = validateAnalyticsQuery(base({ measure: "runs", dimension: "workflow" }));
    expect(cat.ok && cat.query.limit).toBe(ANALYTICS_QUERY_DEFAULT_CATEGORY_ROWS);
    expect(cat.ok && cat.query.sort).toEqual({ by: "value", dir: "desc" });
  });
});
