/** @jest-environment node */
import { buildAnalyticsGridItems } from "@/features/analytics/grid/buildAnalyticsGridItems";
import { AnalyticsWidgetSchema, type AnalyticsWidget } from "@/contracts/analytics";
import type { AnalyticsWidgetSize } from "@/contracts/analytics";
import type { PlacedWidget } from "@/core/analytics/layout";

/**
 * ANALYTICS-EXPLICIT-LAYOUT-S3-RENDER-SEAM-1 — the widget ↔ placement pairing.
 *
 * The guarantee: a board either pairs up completely or it fails, loudly and
 * typed. The old renderer's defining failure was that a widget with no usable
 * position still appeared somewhere, because CSS auto-flow always has an answer.
 */

const widget = (id: string, size: AnalyticsWidgetSize = "s"): AnalyticsWidget =>
  AnalyticsWidgetSchema.parse({
    id,
    type: "stat",
    size,
    title: id,
    config: { source: "any", metric: "runs" },
  });

const at = (widgetId: string, x: number, y: number, w = 1, h = 1): PlacedWidget => ({
  widgetId,
  x,
  y,
  w,
  h,
});

const codesOf = (result: ReturnType<typeof buildAnalyticsGridItems>) =>
  result.ok ? [] : result.problems.map((p) => p.code);

describe("a complete board pairs every widget with its rectangle", () => {
  it("returns exactly one item per widget", () => {
    const widgets = [widget("a"), widget("b", "m")];
    const result = buildAnalyticsGridItems(widgets, [at("a", 0, 0), at("b", 1, 0, 2, 1)]);
    expect(result.ok && result.items).toHaveLength(2);
    expect(result.ok && result.items.map((i) => i.widget.id)).toEqual(["a", "b"]);
  });

  it("carries each widget's original array index for tie-breaking", () => {
    const widgets = [widget("first"), widget("second")];
    const result = buildAnalyticsGridItems(widgets, [at("first", 1, 0), at("second", 0, 0)]);
    // Reading order puts `second` first; the original indexes are unchanged.
    expect(result.ok && result.items.map((i) => [i.widget.id, i.originalIndex])).toEqual([
      ["second", 1],
      ["first", 0],
    ]);
  });

  it("pairs an empty board with an empty layout", () => {
    expect(buildAnalyticsGridItems([], [])).toEqual({ ok: true, items: [] });
  });
});

describe("an incomplete pairing fails rather than rendering something plausible", () => {
  it("refuses a widget with no placement, and names it", () => {
    const result = buildAnalyticsGridItems([widget("a"), widget("stranded")], [at("a", 0, 0)]);
    expect(result.ok).toBe(false);
    const problem = !result.ok ? result.problems.find((p) => p.code === "missing-placement") : null;
    expect(problem?.widgetIds).toEqual(["stranded"]);
  });

  it("never silently omits an unmatched widget by returning a shorter list", () => {
    const result = buildAnalyticsGridItems([widget("a"), widget("stranded")], [at("a", 0, 0)]);
    // The failure path carries no items at all — there is no partial success.
    expect("items" in result).toBe(false);
  });

  it("refuses a placement whose widget is not on the board", () => {
    const result = buildAnalyticsGridItems([widget("a")], [at("a", 0, 0), at("ghost", 1, 0)]);
    expect(codesOf(result)).toContain("orphan-placement");
  });

  it("refuses a repeated widget id", () => {
    const result = buildAnalyticsGridItems(
      [widget("dup"), widget("dup")],
      [at("dup", 0, 0), at("dup", 1, 0)],
    );
    expect(codesOf(result)).toEqual(
      expect.arrayContaining(["duplicate-widget-id", "duplicate-placement-id"]),
    );
  });

  it("refuses a repeated placement id", () => {
    const result = buildAnalyticsGridItems([widget("a")], [at("a", 0, 0), at("a", 1, 0)]);
    expect(codesOf(result)).toContain("duplicate-placement-id");
  });

  it("refuses a rectangle whose size contradicts the widget's preset", () => {
    const result = buildAnalyticsGridItems([widget("a", "s")], [at("a", 0, 0, 2, 1)]);
    expect(codesOf(result)).toContain("size-layout-mismatch");
  });

  it("refuses an overlapping board — the engine, not a second implementation, decides", () => {
    const result = buildAnalyticsGridItems(
      [widget("a", "m"), widget("b", "m")],
      [at("a", 0, 0, 2, 1), at("b", 1, 0, 2, 1)],
    );
    expect(codesOf(result)).toContain("invalid-layout");
  });

  it("refuses a rectangle hanging past the last column", () => {
    const result = buildAnalyticsGridItems([widget("a", "m")], [at("a", 3, 0, 2, 1)]);
    expect(codesOf(result)).toContain("invalid-layout");
  });

  it("reports every problem it finds, not just the first", () => {
    const result = buildAnalyticsGridItems(
      [widget("a"), widget("stranded")],
      [at("a", 0, 0), at("ghost", 1, 0)],
    );
    // Both pairing faults are reported together. The rectangles themselves are
    // fine — `validateLayout` has nothing to say — which is exactly why the
    // pairing check has to exist separately from the engine's board check.
    expect(new Set(codesOf(result))).toEqual(
      new Set(["missing-placement", "orphan-placement"]),
    );
  });

  it("names only widget ids — never a title, config or note", () => {
    const secretive = {
      ...widget("secretive"),
      title: "Q3 acquisition targets",
      config: { source: "any", note: "confidential" },
    } as AnalyticsWidget;
    const result = buildAnalyticsGridItems([secretive], []);
    const text = JSON.stringify(!result.ok ? result.problems : []);
    expect(text).not.toContain("acquisition");
    expect(text).not.toContain("confidential");
  });
});

describe("reading order is deterministic", () => {
  it("orders down the rows, then across", () => {
    const widgets = [widget("bottom"), widget("topRight"), widget("topLeft")];
    const result = buildAnalyticsGridItems(widgets, [
      at("bottom", 0, 1),
      at("topRight", 2, 0),
      at("topLeft", 0, 0),
    ]);
    expect(result.ok && result.items.map((i) => i.widget.id)).toEqual([
      "topLeft",
      "topRight",
      "bottom",
    ]);
  });

  it("depends on the coordinates, not on the order the arrays arrived in", () => {
    const layout = [at("topLeft", 0, 0), at("topRight", 2, 0), at("bottom", 0, 1)];
    const forwards = buildAnalyticsGridItems(
      [widget("topLeft"), widget("topRight"), widget("bottom")],
      layout,
    );
    const backwards = buildAnalyticsGridItems(
      [widget("bottom"), widget("topRight"), widget("topLeft")],
      [...layout].reverse(),
    );
    const ids = (r: typeof forwards) => (r.ok ? r.items.map((i) => i.widget.id) : []);
    expect(ids(backwards)).toEqual(ids(forwards));
    expect(ids(forwards)).toEqual(["topLeft", "topRight", "bottom"]);
    // `originalIndex` and `widgetId` remain in the comparator as a last resort;
    // in a VALID board no two widgets share a cell, so y/x always decides.
  });

  it("produces the same order for the same board every time", () => {
    const widgets = [widget("a"), widget("b"), widget("c")];
    const layout = [at("c", 2, 0), at("a", 0, 0), at("b", 1, 0)];
    const once = buildAnalyticsGridItems(widgets, layout);
    const twice = buildAnalyticsGridItems(widgets, layout);
    expect(twice).toEqual(once);
  });

  it("does not mutate the widget array it was given", () => {
    const widgets = [widget("b"), widget("a")];
    const snapshot = JSON.parse(JSON.stringify(widgets)) as unknown;
    buildAnalyticsGridItems(widgets, [at("b", 1, 0), at("a", 0, 0)]);
    expect(JSON.parse(JSON.stringify(widgets))).toEqual(snapshot);
    expect(widgets.map((w) => w.id)).toEqual(["b", "a"]);
  });

  it("does not mutate the layout array it was given", () => {
    const layout = [at("b", 1, 0), at("a", 0, 0)];
    const snapshot = JSON.parse(JSON.stringify(layout)) as unknown;
    buildAnalyticsGridItems([widget("b"), widget("a")], layout);
    expect(JSON.parse(JSON.stringify(layout))).toEqual(snapshot);
    expect(layout.map((p) => p.widgetId)).toEqual(["b", "a"]);
  });
});
