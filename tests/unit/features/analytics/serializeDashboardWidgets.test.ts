import { serializeDashboardWidgets } from "@/core/analytics/layout";
import { AnalyticsWidgetSchema, type AnalyticsWidget } from "@/contracts/analytics";
import type { AnalyticsWidgetSize } from "@/contracts/analytics";

/**
 * ANALYTICS-EXPLICIT-LAYOUT-S2-CONTRACT-1 — the write boundary.
 *
 * The guarantee under test: starting to persist explicit placement is a
 * DELIBERATE act, never a side effect of an unrelated save. A legacy board must
 * survive a rename without silently changing storage generation, because
 * crossing that line is one-way while a rollback is still possible.
 */

const widget = (
  id: string,
  size: AnalyticsWidgetSize = "s",
  layout?: { x: number; y: number; w: number; h: number },
): AnalyticsWidget =>
  AnalyticsWidgetSchema.parse({
    id,
    type: "stat",
    size,
    title: id,
    config: { source: "any", metric: "runs" },
    ...(layout ? { layout } : {}),
  });

const OPTIONS = { columnCount: 4 };

describe("preserve-source emits exactly what it was given", () => {
  it("keeps a legacy board legacy — no widget gains a placement", () => {
    const widgets = [widget("a"), widget("b", "m")];
    const result = serializeDashboardWidgets(widgets, "preserve-source", OPTIONS);
    expect(result).toEqual({ ok: true, widgets });
    if (result.ok) {
      for (const w of result.widgets) expect("layout" in w).toBe(false);
    }
  });

  it("survives a title-only edit without converting the board", () => {
    const widgets = [widget("a"), widget("b")];
    const renamed = widgets.map((w) => (w.id === "a" ? { ...w, title: "Renamed" } : w));
    const result = serializeDashboardWidgets(renamed, "preserve-source", OPTIONS);
    expect(result.ok && result.widgets.every((w) => !("layout" in w))).toBe(true);
    expect(result.ok && result.widgets[0]?.title).toBe("Renamed");
  });

  it("survives a config-only edit without converting the board", () => {
    const widgets = [widget("a")];
    const reconfigured = widgets.map((w) => ({
      ...w,
      config: { ...w.config, metric: "success_rate" as const },
    }));
    const result = serializeDashboardWidgets(reconfigured, "preserve-source", OPTIONS);
    expect(result.ok && "layout" in result.widgets[0]!).toBe(false);
  });

  it("keeps an explicit board's exact rectangles, uncompacted and unreordered", () => {
    // Deliberate gaps at rows 0-1 and columns 0-2; a save must not tidy them.
    const widgets = [
      widget("far", "s", { x: 3, y: 4, w: 1, h: 1 }),
      widget("near", "m", { x: 0, y: 2, w: 2, h: 1 }),
    ];
    const result = serializeDashboardWidgets(widgets, "preserve-source", OPTIONS);
    expect(result.ok && result.widgets.map((w) => w.layout)).toEqual([
      { x: 3, y: 4, w: 1, h: 1 },
      { x: 0, y: 2, w: 2, h: 1 },
    ]);
    expect(result.ok && result.widgets.map((w) => w.id)).toEqual(["far", "near"]);
  });

  it("ignores an effective layout it was handed — having one is not intent", () => {
    const widgets = [widget("a")];
    const result = serializeDashboardWidgets(widgets, "preserve-source", {
      ...OPTIONS,
      layout: [{ widgetId: "a", x: 2, y: 2, w: 1, h: 1 }],
    });
    expect(result.ok && "layout" in result.widgets[0]!).toBe(false);
  });
});

describe("persist-explicit-layout writes placement for the whole board", () => {
  it("attaches every widget's rectangle from the supplied layout", () => {
    const widgets = [widget("a"), widget("b", "m")];
    const result = serializeDashboardWidgets(widgets, "persist-explicit-layout", {
      ...OPTIONS,
      layout: [
        { widgetId: "a", x: 3, y: 0, w: 1, h: 1 },
        { widgetId: "b", x: 0, y: 1, w: 2, h: 1 },
      ],
    });
    expect(result.ok && result.widgets.map((w) => w.layout)).toEqual([
      { x: 3, y: 0, w: 1, h: 1 },
      { x: 0, y: 1, w: 2, h: 1 },
    ]);
  });

  it("emits widgets the strict contract accepts, so the save can round-trip", () => {
    const widgets = [widget("a", "l")];
    const result = serializeDashboardWidgets(widgets, "persist-explicit-layout", {
      ...OPTIONS,
      layout: [{ widgetId: "a", x: 0, y: 0, w: 2, h: 2 }],
    });
    expect(result.ok && AnalyticsWidgetSchema.safeParse(result.widgets[0]).success).toBe(true);
  });

  it("preserves a deliberate gap rather than compacting on the way out", () => {
    const widgets = [widget("a")];
    const result = serializeDashboardWidgets(widgets, "persist-explicit-layout", {
      ...OPTIONS,
      layout: [{ widgetId: "a", x: 2, y: 5, w: 1, h: 1 }],
    });
    expect(result.ok && result.widgets[0]?.layout).toEqual({ x: 2, y: 5, w: 1, h: 1 });
  });

  it("refuses a partly-placed board rather than writing an invalid transitional state", () => {
    const widgets = [widget("a"), widget("b")];
    const result = serializeDashboardWidgets(widgets, "persist-explicit-layout", {
      ...OPTIONS,
      layout: [{ widgetId: "a", x: 0, y: 0, w: 1, h: 1 }],
    });
    expect(result).toMatchObject({ ok: false, reason: "missing-placement" });
  });

  it("refuses a layout that still places a removed widget", () => {
    const widgets = [widget("a")];
    const result = serializeDashboardWidgets(widgets, "persist-explicit-layout", {
      ...OPTIONS,
      layout: [
        { widgetId: "a", x: 0, y: 0, w: 1, h: 1 },
        { widgetId: "deleted", x: 1, y: 0, w: 1, h: 1 },
      ],
    });
    expect(result).toMatchObject({ ok: false, reason: "stale-placement" });
  });

  it("refuses a rectangle that contradicts the widget's size preset", () => {
    const widgets = [widget("a", "s")];
    const result = serializeDashboardWidgets(widgets, "persist-explicit-layout", {
      ...OPTIONS,
      layout: [{ widgetId: "a", x: 0, y: 0, w: 2, h: 1 }],
    });
    expect(result).toMatchObject({ ok: false, reason: "size-layout-mismatch" });
  });

  it("validates the whole board and refuses an overlap instead of silently repairing it", () => {
    const widgets = [widget("a", "m"), widget("b", "m")];
    const result = serializeDashboardWidgets(widgets, "persist-explicit-layout", {
      ...OPTIONS,
      layout: [
        { widgetId: "a", x: 0, y: 0, w: 2, h: 1 },
        { widgetId: "b", x: 1, y: 0, w: 2, h: 1 },
      ],
    });
    expect(result).toMatchObject({ ok: false, reason: "invalid-layout" });
  });

  it("refuses a rectangle hanging past the last column", () => {
    const widgets = [widget("a", "m")];
    const result = serializeDashboardWidgets(widgets, "persist-explicit-layout", {
      ...OPTIONS,
      layout: [{ widgetId: "a", x: 3, y: 0, w: 2, h: 1 }],
    });
    expect(result).toMatchObject({ ok: false, reason: "invalid-layout" });
  });

  it("does not mutate the widgets it was given", () => {
    const widgets = [widget("a")];
    const snapshot = JSON.parse(JSON.stringify(widgets)) as unknown;
    serializeDashboardWidgets(widgets, "persist-explicit-layout", {
      ...OPTIONS,
      layout: [{ widgetId: "a", x: 1, y: 1, w: 1, h: 1 }],
    });
    expect(JSON.parse(JSON.stringify(widgets))).toEqual(snapshot);
  });

  it("serializes an empty board to an empty board", () => {
    expect(serializeDashboardWidgets([], "persist-explicit-layout", OPTIONS)).toEqual({
      ok: true,
      widgets: [],
    });
  });
});
