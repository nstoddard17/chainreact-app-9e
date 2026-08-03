/** @jest-environment node */
import type { InsightWidgetConfig } from "@/contracts/analytics";
import {
  MAX_EXPLORATION_DEPTH,
  refineInsightConfig,
  suggestedExplorationTitle,
  type InsightDrill,
} from "@/features/analytics/insights/insightRefine";
import { insightQueryFromConfig } from "@/features/analytics/insights/insightQueryFromConfig";
import { FIXTURE_CATALOG } from "./fixtures";

/**
 * CD-5B — pure query refinement.
 *
 * Driven entirely by the FICTIONAL fixture catalog: drilling is a property of
 * declared capabilities, never of a provider name. The function reuses the
 * builder's own reconciliation, so anything it emits is a query the builder
 * itself would accept — and anything invalid is rejected BEFORE submission.
 */

const NOW = Date.parse("2026-07-15T12:00:00.000Z");

function config(overrides: Partial<InsightWidgetConfig> = {}): InsightWidgetConfig {
  return {
    source: "acme",
    dataset: "orders",
    measure: "order_count",
    dimension: "status",
    range: { preset: "30d" },
    chart: "bar",
    ...overrides,
  };
}

const PAID: InsightDrill = {
  kind: "filter",
  refine: { filterKey: "status", filterValue: "paid", label: "Paid" },
  fromSeries: false,
};

function refined(c: InsightWidgetConfig, drill: InsightDrill) {
  const out = refineInsightConfig(FIXTURE_CATALOG, c, drill, NOW);
  if ("error" in out) throw new Error(`unexpected refusal: ${out.error}`);
  return out;
}

describe("categorical drill", () => {
  it("adds the canonical filter value and keeps everything else", () => {
    const out = refined(config({ filters: { item: ["it-1"] } }), PAID);
    expect(out.config.filters).toEqual({ item: ["it-1"], status: ["paid"] });
    expect(out.config.measure).toBe("order_count");
    expect(out.config.dimension).toBe("status");
    expect(out.config.chart).toBe("bar");
    expect(out.crumb).toBe("Paid");
    expect(out.description).toBe("Exploring: Status is Paid");
  });

  it("REPLACES an existing same-field filter, preserving unrelated ones", () => {
    const out = refined(
      config({ filters: { status: ["refunded"], item: ["it-1"] } }),
      PAID,
    );
    expect(out.config.filters).toEqual({ item: ["it-1"], status: ["paid"] });
  });

  it("never changes source or dataset", () => {
    const out = refined(config(), PAID);
    expect(out.config.source).toBe("acme");
    expect(out.config.dataset).toBe("orders");
  });

  it("a series drill also collapses the series (one value is not multi-line)", () => {
    const out = refined(
      config({
        dimension: "time",
        chart: "line",
        series: { by: "status" },
      }),
      { ...PAID, fromSeries: true },
    );
    expect(out.config.series).toBeUndefined();
    expect(out.config.filters).toEqual({ status: ["paid"] });
  });
});

describe("time-bucket drill", () => {
  const BUCKET: InsightDrill = {
    kind: "bucket",
    start: "2026-07-01T00:00:00.000Z",
    end: "2026-08-01T00:00:00.000Z",
    label: "2026-07-01",
    period: "current",
  };

  it("uses the server boundaries verbatim — no browser calendar math", () => {
    const out = refined(config({ dimension: "time", chart: "line" }), BUCKET);
    expect(out.config.range).toEqual({
      from: "2026-07-01T00:00:00.000Z",
      to: "2026-08-01T00:00:00.000Z",
    });
    // And the wire query passes the exclusive instant through unchanged —
    // full instants never get the +1-day inclusive-date treatment (CD-5A).
    expect(insightQueryFromConfig(out.config).range).toEqual({
      from: "2026-07-01T00:00:00.000Z",
      to: "2026-08-01T00:00:00.000Z",
    });
  });

  it("describes the window with the CD-5A inclusive-end convention", () => {
    const out = refined(config({ dimension: "time", chart: "line" }), BUCKET);
    expect(out.crumb).toBe("Jul 1, 2026 – Jul 31, 2026");
    expect(out.description).toBe("Exploring Jul 1, 2026 – Jul 31, 2026 (UTC)");
  });

  it("defaults comparison OFF in the child exploration", () => {
    const out = refined(
      config({ dimension: null, chart: "kpi", compare: "previous_period" }),
      BUCKET,
    );
    expect(out.config.compare).toBeUndefined();
  });

  it("preserves filters through a time drill", () => {
    const out = refined(
      config({ dimension: "time", chart: "line", filters: { status: ["paid"] } }),
      BUCKET,
    );
    expect(out.config.filters).toEqual({ status: ["paid"] });
  });

  it("falls an explicit grain back to Automatic when the bucket is too narrow", () => {
    const day: InsightDrill = {
      kind: "bucket",
      start: "2026-07-15T00:00:00.000Z",
      end: "2026-07-16T00:00:00.000Z",
      label: "2026-07-15",
      period: "current",
    };
    const out = refined(config({ dimension: "time", chart: "line", timeGrain: "month" }), day);
    expect(out.config.timeGrain).toBeUndefined(); // auto is the unstored default
    expect(out.notes.some((n) => /automatic grouping/i.test(n))).toBe(true);
  });

  it("preserves an explicit grain that still fits", () => {
    const out = refined(config({ dimension: "time", chart: "line", timeGrain: "day" }), BUCKET);
    expect(out.config.timeGrain).toBe("day");
  });

  it("labels a previous-period bucket as such", () => {
    const out = refined(config({ dimension: "time", chart: "line" }), {
      ...BUCKET,
      period: "previous",
    });
    expect(out.crumb).toBe("Previous period · Jul 1, 2026 – Jul 31, 2026");
    expect(out.description).toMatch(/previous period/i);
  });
});

describe("previous-window drill (KPI)", () => {
  it("drills into the server-supplied previous range with compare off", () => {
    const out = refined(
      config({ dimension: null, chart: "kpi", compare: "previous_period" }),
      {
        kind: "previous_window",
        from: "2026-05-16T00:00:00.000Z",
        to: "2026-06-15T00:00:00.000Z",
      },
    );
    expect(out.config.range).toEqual({
      from: "2026-05-16T00:00:00.000Z",
      to: "2026-06-15T00:00:00.000Z",
    });
    expect(out.config.compare).toBeUndefined();
    expect(out.crumb).toMatch(/^Previous period/);
  });
});

describe("invalid candidates are refused before submission", () => {
  it("refuses a filter key the dataset does not declare", () => {
    const out = refineInsightConfig(
      FIXTURE_CATALOG,
      config(),
      {
        kind: "filter",
        refine: { filterKey: "nonsense", filterValue: "x", label: "X" },
        fromSeries: false,
      },
      NOW,
    );
    // The reconciler prunes the unknown filter — which would leave the parent
    // question unchanged. A silent no-op is refused, not submitted.
    expect("error" in out).toBe(true);
  });

  it("refuses a bucket wider than the dataset's own maximum", () => {
    const out = refineInsightConfig(
      FIXTURE_CATALOG,
      config({ dimension: "time", chart: "line" }),
      {
        kind: "bucket",
        start: "2020-01-01T00:00:00.000Z",
        end: "2026-01-01T00:00:00.000Z",
        label: "huge",
        period: "current",
      },
      NOW,
    );
    expect("error" in out).toBe(true);
  });

  it("refuses an unparseable bucket", () => {
    const out = refineInsightConfig(
      FIXTURE_CATALOG,
      config({ dimension: "time", chart: "line" }),
      { kind: "bucket", start: "garbage", end: "more", label: "?", period: "current" },
      NOW,
    );
    expect("error" in out).toBe(true);
  });
});

describe("exploration depth", () => {
  it("declares a small bounded maximum", () => {
    expect(MAX_EXPLORATION_DEPTH).toBe(5);
  });
});

describe("suggested titles", () => {
  it("builds a readable, bounded title from safe labels", () => {
    expect(suggestedExplorationTitle("Orders", "Orders", ["Paid", "Jul 1, 2026 – Jul 31, 2026"])).toBe(
      "Orders — Orders — Paid — Jul 1, 2026 – Jul 31, 2026",
    );
  });

  it("caps at the widget title limit", () => {
    const long = suggestedExplorationTitle("Orders", "Orders", ["x".repeat(300)]);
    expect(long.length).toBeLessThanOrEqual(120);
  });
});
