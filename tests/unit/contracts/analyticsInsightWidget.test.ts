/** @jest-environment node */
import {
  AnalyticsWidgetSchema,
  AnalyticsWidgetsSchema,
  InsightWidgetConfigSchema,
  type AnalyticsWidget,
  type InsightWidgetConfig,
} from "@/contracts/analytics";

/**
 * Custom Insight widget persistence contract (CD-3A).
 *
 * The insight config stores ONLY the user's question — strict schemas make
 * account/user/integration ids, tokens, results, freshness, and colors
 * unrepresentable in the dashboard JSONB.
 */

const VALID_INSIGHT: InsightWidgetConfig = {
  source: "chainreact",
  dataset: "workflow_runs",
  measure: "failed_runs",
  dimension: "time",
  timeGrain: "week",
  filters: { trigger_source: ["webhook"], include_tests: true },
  series: { by: "workflow", mode: "explicit", ids: ["wf-1", "wf-2"] },
  range: { preset: "30d" },
  compare: null,
  chart: "line",
};

describe("InsightWidgetConfigSchema", () => {
  it("accepts a full valid config and round-trips it unchanged", () => {
    const parsed = InsightWidgetConfigSchema.parse(VALID_INSIGHT);
    expect(parsed).toEqual(VALID_INSIGHT);
    // Save → JSONB → load round trip.
    expect(InsightWidgetConfigSchema.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(
      VALID_INSIGHT,
    );
  });

  it("accepts a minimal KPI config", () => {
    expect(
      InsightWidgetConfigSchema.safeParse({
        source: "stripe",
        dataset: "payments",
        measure: "gross_payment_amount",
        dimension: null,
        chart: "kpi",
      }).success,
    ).toBe(true);
  });

  it("rejects unknown keys at every level (strict)", () => {
    for (const bad of [
      { ...VALID_INSIGHT, accountId: "acc-1" },
      { ...VALID_INSIGHT, userId: "user-1" },
      { ...VALID_INSIGHT, integrationId: "int-1" },
      { ...VALID_INSIGHT, accessToken: "tok" },
      { ...VALID_INSIGHT, result: { value: 5 } },
      { ...VALID_INSIGHT, freshness: { mode: "cached" } },
      { ...VALID_INSIGHT, rows: [] },
      { ...VALID_INSIGHT, colors: ["#fff"] },
      { ...VALID_INSIGHT, series: { by: "workflow", mode: "explicit", ids: ["a"], labels: ["A"] } },
      { ...VALID_INSIGHT, range: { preset: "30d", cached: true } },
    ]) {
      expect(InsightWidgetConfigSchema.safeParse(bad).success).toBe(false);
    }
  });

  it("accepts every shipped chart type, incl. the CD-3B additions", () => {
    for (const chart of ["kpi", "line", "bar", "table", "donut"]) {
      expect(
        InsightWidgetConfigSchema.safeParse({ ...VALID_INSIGHT, chart }).success,
      ).toBe(true);
    }
  });

  it("persists category ordering + row bounds (CD-3B)", () => {
    const categorical = {
      ...VALID_INSIGHT,
      dimension: "status",
      series: undefined,
      chart: "bar",
      sort: { by: "value", dir: "desc" },
      limit: 10,
    };
    delete (categorical as { series?: unknown }).series;
    const parsed = InsightWidgetConfigSchema.safeParse(categorical);
    expect(parsed.success).toBe(true);
    // Bounds + strictness still hold.
    expect(
      InsightWidgetConfigSchema.safeParse({ ...categorical, limit: 51 }).success,
    ).toBe(false);
    expect(
      InsightWidgetConfigSchema.safeParse({ ...categorical, sort: { by: "runs", dir: "desc" } })
        .success,
    ).toBe(false);
    expect(
      InsightWidgetConfigSchema.safeParse({ ...categorical, sort: { by: "value", dir: "desc", nulls: "last" } })
        .success,
    ).toBe(false);
  });

  it("rejects unknown chart types and malformed shapes", () => {
    expect(
      InsightWidgetConfigSchema.safeParse({ ...VALID_INSIGHT, chart: "heatmap" }).success,
    ).toBe(false);
    expect(
      InsightWidgetConfigSchema.safeParse({ ...VALID_INSIGHT, chart: "pie" }).success,
    ).toBe(false);
    expect(
      InsightWidgetConfigSchema.safeParse({ ...VALID_INSIGHT, series: { mode: "top" } }).success,
    ).toBe(false);
    expect(
      InsightWidgetConfigSchema.safeParse({ ...VALID_INSIGHT, filters: { status: "failed" } })
        .success,
    ).toBe(false);
  });
});

describe("insight widgets inside the dashboard contract", () => {
  const insightWidget: AnalyticsWidget = {
    id: "w-insight",
    type: "insight",
    size: "m",
    title: "Failed runs by week",
    icon: "Sparkle",
    config: { source: "any", insight: VALID_INSIGHT },
  };

  it("an insight widget parses inside the widgets array", () => {
    expect(AnalyticsWidgetsSchema.safeParse([insightWidget]).success).toBe(true);
  });

  it("an unconfigured insight widget (no config.insight) is valid", () => {
    expect(
      AnalyticsWidgetSchema.safeParse({
        ...insightWidget,
        config: { source: "any" },
      }).success,
    ).toBe(true);
  });

  it("every legacy widget shape still parses unchanged", () => {
    const legacy: AnalyticsWidget[] = [
      { id: "a", type: "stat", size: "s", title: "Runs", config: { source: "any", metric: "runs" } },
      { id: "b", type: "note", size: "m", title: "Note", config: { source: "any", note: "hi" } },
      {
        id: "c",
        type: "line",
        size: "xl",
        title: "Slack",
        config: {
          source: "any",
          dataSource: { kind: "connected_app", provider: "slack", metricKey: "messages" },
        },
      },
    ];
    const parsed = AnalyticsWidgetsSchema.safeParse(legacy);
    expect(parsed.success).toBe(true);
  });

  it("a widget whose insight config is malformed fails ITS OWN parse only", () => {
    const bad = {
      ...insightWidget,
      id: "w-bad",
      config: { source: "any", insight: { ...VALID_INSIGHT, accountId: "acc" } },
    };
    expect(AnalyticsWidgetSchema.safeParse(bad).success).toBe(false);
    // The sibling stays parseable — per-widget salvage is proven in the
    // dashboards service test.
    expect(AnalyticsWidgetSchema.safeParse(insightWidget).success).toBe(true);
  });
});
