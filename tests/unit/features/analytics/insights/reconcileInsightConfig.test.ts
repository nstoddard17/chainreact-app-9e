/** @jest-environment node */
import {
  emptyInsightDraft,
  insightDraftFromConfig,
  reconcileInsightDraft,
  type InsightDraft,
} from "@/features/analytics/insights/reconcileInsightConfig";
import {
  insightConfigFromDraft,
  insightDraftIssues,
  insightQueryFromConfig,
} from "@/features/analytics/insights/insightQueryFromConfig";
import { FIXTURE_CATALOG } from "./fixtures";

/**
 * Deterministic dependency reconciliation (CD-3A): the smallest invalid
 * portion is cleared, valid downstream choices survive, every clear carries
 * an explanation, and the user's question is never silently substituted.
 */

function acmeLineDraft(): InsightDraft {
  return {
    source: "acme",
    dataset: "orders",
    measure: "order_count",
    dimension: "time",
    timeGrain: "week",
    filters: { status: ["paid"], include_drafts: true },
    series: { by: "item", mode: "explicit", ids: ["i-1", "i-2"] },
    range: { preset: "30d" },
    compare: false,
    sort: null,
    chart: "line",
  };
}

describe("reconcileInsightDraft", () => {
  it("a fully valid draft passes through untouched, no resets", () => {
    const { draft, resets } = reconcileInsightDraft(FIXTURE_CATALOG, acmeLineDraft());
    expect(draft).toEqual(acmeLineDraft());
    expect(resets).toEqual([]);
  });

  it("unknown source clears everything with an explanation (obsolete config)", () => {
    const { draft, resets } = reconcileInsightDraft(FIXTURE_CATALOG, {
      ...acmeLineDraft(),
      source: "gone",
    });
    expect(draft.source).toBeNull();
    expect(draft.dataset).toBeNull();
    expect(draft.measure).toBeNull();
    expect(draft.series).toBeNull();
    expect(resets.length).toBeGreaterThan(0);
  });

  it("dataset change: nonexistent measure/filters/series cleared, valid ones preserved", () => {
    // Switch orders → audits: scan_count doesn't exist under orders and vice versa.
    const { draft, resets } = reconcileInsightDraft(FIXTURE_CATALOG, {
      ...acmeLineDraft(),
      dataset: "audits",
    });
    expect(draft.dataset).toBe("audits");
    expect(draft.measure).toBeNull(); // order_count doesn't exist in audits
    expect(draft.filters).toEqual({}); // no filters exist in audits
    expect(draft.series).toBeNull();
    expect(resets.some((r) => r.field === "measure")).toBe(true);
    expect(resets.some((r) => r.field === "filters")).toBe(true);
  });

  it("measure change to a time-only monetary measure clears incompatible filter + series, keeps the rest", () => {
    const { draft, resets } = reconcileInsightDraft(FIXTURE_CATALOG, {
      ...acmeLineDraft(),
      measure: "gross_amount", // dims ["time"], incompatible with status filter
    });
    expect(draft.measure).toBe("gross_amount");
    expect(draft.dimension).toBe("time"); // still valid
    expect(draft.filters["status"]).toBeUndefined(); // incompatible → removed
    expect(draft.filters["include_drafts"]).toBe(true); // still valid → kept
    expect(draft.series).toBeNull(); // item series not in gross_amount dims
    expect(resets.some((r) => r.field === "filters")).toBe(true);
    expect(resets.some((r) => r.field === "series")).toBe(true);
  });

  it("switching Line → Number clears time-series-only configuration with notes", () => {
    const { draft, resets } = reconcileInsightDraft(FIXTURE_CATALOG, {
      ...acmeLineDraft(),
      dimension: null,
      chart: null,
    });
    expect(draft.dimension).toBeNull();
    expect(draft.timeGrain).toBe("auto");
    expect(draft.series).toBeNull();
    expect(draft.chart).toBe("kpi"); // only one honest choice → auto-filled
    expect(resets.some((r) => r.field === "timeGrain")).toBe(true);
    expect(resets.some((r) => r.field === "series")).toBe(true);
  });

  it("explicit series ids are clamped to the capability max with a note", () => {
    const ids = Array.from({ length: 12 }, (_, i) => `i-${i}`);
    const { draft, resets } = reconcileInsightDraft(FIXTURE_CATALOG, {
      ...acmeLineDraft(),
      series: { by: "item", mode: "explicit", ids },
    });
    expect(draft.series?.ids).toHaveLength(8);
    expect(resets.some((r) => r.field === "series")).toBe(true);
  });

  it("automatic series capability strips mode/ids/topN silently (same question)", () => {
    const { draft } = reconcileInsightDraft(FIXTURE_CATALOG, {
      ...acmeLineDraft(),
      series: { by: "status", mode: "top", topN: 3 },
    });
    expect(draft.series).toEqual({ by: "status" });
  });

  it("declared-value filters drop values the catalog no longer declares", () => {
    const { draft, resets } = reconcileInsightDraft(FIXTURE_CATALOG, {
      ...acmeLineDraft(),
      filters: { status: ["paid", "archived"] },
    });
    expect(draft.filters["status"]).toEqual(["paid"]);
    expect(resets.some((r) => r.field === "filters")).toBe(true);
  });

  it("compare resets when a multi-line series makes it invalid", () => {
    const { draft, resets } = reconcileInsightDraft(FIXTURE_CATALOG, {
      ...acmeLineDraft(),
      compare: true,
    });
    expect(draft.compare).toBe(false);
    expect(resets.some((r) => r.field === "compare")).toBe(true);
    // Without series, compare on time is fine.
    const single = reconcileInsightDraft(FIXTURE_CATALOG, {
      ...acmeLineDraft(),
      series: null,
      compare: true,
    });
    expect(single.draft.compare).toBe(true);
  });

  it("a saved config round-trips through draft form losslessly", () => {
    const config = insightConfigFromDraft(acmeLineDraft())!;
    expect(config).not.toBeNull();
    const draft = insightDraftFromConfig(config);
    const { draft: reconciled, resets } = reconcileInsightDraft(FIXTURE_CATALOG, draft);
    expect(resets).toEqual([]);
    expect(insightConfigFromDraft(reconciled)).toEqual(config);
  });
});

describe("insightConfigFromDraft / insightQueryFromConfig", () => {
  it("incomplete drafts produce no config and name the next step", () => {
    expect(insightConfigFromDraft(emptyInsightDraft())).toBeNull();
    expect(insightDraftIssues(FIXTURE_CATALOG, emptyInsightDraft())).toEqual([
      "Choose where your data comes from.",
    ]);
    const noMeasure = { ...acmeLineDraft(), measure: null };
    expect(insightConfigFromDraft(noMeasure)).toBeNull();
    expect(insightDraftIssues(FIXTURE_CATALOG, noMeasure)).toEqual([
      "Choose what the chart should show.",
    ]);
  });

  it("an explicit series with no ids is not queryable", () => {
    const draft = { ...acmeLineDraft(), series: { by: "item", mode: "explicit" as const, ids: [] } };
    expect(insightConfigFromDraft(draft)).toBeNull();
    expect(
      insightDraftIssues(FIXTURE_CATALOG, draft).some((i) => i.includes("its own line")),
    ).toBe(true);
  });

  it("a custom range beyond the dataset's max is locally rejected", () => {
    const draft = {
      ...acmeLineDraft(),
      range: { from: "2026-01-01", to: "2026-06-30" }, // > 90 days for acme
    };
    expect(
      insightDraftIssues(FIXTURE_CATALOG, draft).some((i) => i.includes("90 days")),
    ).toBe(true);
  });

  it("the persisted config becomes exactly the wire query (same path as preview)", () => {
    const config = insightConfigFromDraft(acmeLineDraft())!;
    expect(insightQueryFromConfig(config)).toEqual({
      source: "acme",
      dataset: "orders",
      measure: "order_count",
      dimension: "time",
      timeGrain: "week",
      filters: { status: ["paid"], include_drafts: true },
      series: { by: "item", mode: "explicit", ids: ["i-1", "i-2"] },
      range: { preset: "30d" },
      chart: "line",
    });
  });

  it("a config without a range queries the default preset (never undefined)", () => {
    const config = insightConfigFromDraft(acmeLineDraft())!;
    const { range: _range, ...rest } = config;
    expect(insightQueryFromConfig(rest as typeof config).range).toEqual({ preset: "30d" });
  });
});
