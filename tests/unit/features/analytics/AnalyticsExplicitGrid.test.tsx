import { render, screen } from "@testing-library/react";
import { useEffect, useRef, type ComponentProps } from "react";
import { AnalyticsExplicitGrid } from "@/features/analytics/grid/AnalyticsExplicitGrid";
import {
  ANALYTICS_GRID_GAP_PX,
  ANALYTICS_GRID_ROW_HEIGHT_PX,
  rowSpanHeightPx,
} from "@/features/analytics/grid/gridGeometry";
import { AnalyticsWidgetSchema, type AnalyticsWidget } from "@/contracts/analytics";
import type { AnalyticsWidgetSize } from "@/contracts/analytics";
import type { PlacedWidget } from "@/core/analytics/layout";

/**
 * ANALYTICS-EXPLICIT-LAYOUT-S3-RENDER-SEAM-1 — the explicit renderer.
 *
 * Every test here reads the placement the browser would actually use — the grid
 * line and span on the rendered element — not an internal call. jsdom does not
 * lay out CSS Grid, so these prove the INSTRUCTIONS are exact; real rectangles
 * need a browser (see the S3 outcome doc for why that evidence is absent).
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

const body = (w: AnalyticsWidget) => <div data-testid={`body-${w.id}`}>{w.title}</div>;

function cell(widgetId: string): HTMLElement {
  return screen.getByTestId(`analytics-grid-cell-${widgetId}`);
}

/** The four numbers a browser needs to place the element. */
function placementOf(element: HTMLElement) {
  return {
    columnStart: element.style.gridColumnStart,
    columnEnd: element.style.gridColumnEnd,
    rowStart: element.style.gridRowStart,
    rowEnd: element.style.gridRowEnd,
  };
}

function renderGrid(
  widgets: readonly AnalyticsWidget[],
  layout: readonly PlacedWidget[],
  extra: Partial<ComponentProps<typeof AnalyticsExplicitGrid>> = {},
) {
  return render(
    <AnalyticsExplicitGrid widgets={widgets} layout={layout} renderWidget={body} {...extra} />,
  );
}

describe("every widget is rendered, or none is", () => {
  it("renders one cell per widget", () => {
    renderGrid([widget("a"), widget("b")], [at("a", 0, 0), at("b", 1, 0)]);
    expect(screen.getAllByTestId(/^analytics-grid-cell-/)).toHaveLength(2);
    expect(screen.getByTestId("body-a")).toBeTruthy();
    expect(screen.getByTestId("body-b")).toBeTruthy();
  });

  it.each([
    ["a widget with no placement", [widget("a"), widget("stranded")], [at("a", 0, 0)]],
    ["a placement with no widget", [widget("a")], [at("a", 0, 0), at("ghost", 1, 0)]],
    [
      "a duplicate widget id",
      [widget("dup"), widget("dup")],
      [at("dup", 0, 0), at("dup", 1, 0)],
    ],
    ["a duplicate placement id", [widget("a")], [at("a", 0, 0), at("a", 1, 0)]],
    [
      "an overlapping board",
      [widget("a", "m"), widget("b", "m")],
      [at("a", 0, 0, 2, 1), at("b", 1, 0, 2, 1)],
    ],
  ])("refuses to render %s", (_name, widgets, layout) => {
    renderGrid(widgets, layout);
    expect(screen.getByTestId("analytics-explicit-grid-error")).toBeTruthy();
    // Not one widget is drawn: a board that is half right looks correct.
    expect(screen.queryAllByTestId(/^analytics-grid-cell-/)).toHaveLength(0);
    expect(screen.queryByTestId("analytics-explicit-grid")).toBeNull();
  });

  it("shows no widget configuration in the error state", () => {
    const secretive = {
      ...widget("secretive"),
      title: "Q3 acquisition targets",
      config: { source: "any", note: "confidential" },
    } as AnalyticsWidget;
    const { container } = renderGrid([secretive], []);
    expect(container.textContent).not.toContain("acquisition");
    expect(container.textContent).not.toContain("confidential");
  });
});

describe("coordinates become explicit grid lines", () => {
  it("places x = 0, y = 0 at column line 1, row line 1", () => {
    renderGrid([widget("a")], [at("a", 0, 0)]);
    expect(placementOf(cell("a"))).toEqual({
      columnStart: "1",
      columnEnd: "span 1",
      rowStart: "1",
      rowEnd: "span 1",
    });
  });

  it("applies width as a column span and height as a row span", () => {
    renderGrid([widget("a", "l")], [at("a", 1, 2, 2, 2)]);
    expect(placementOf(cell("a"))).toEqual({
      columnStart: "2",
      columnEnd: "span 2",
      rowStart: "3",
      rowEnd: "span 2",
    });
  });

  it("renders the rightmost valid cell", () => {
    renderGrid([widget("a")], [at("a", 3, 0)]);
    expect(placementOf(cell("a")).columnStart).toBe("4");
  });

  it("renders a placement several rows down", () => {
    renderGrid([widget("a")], [at("a", 0, 7)]);
    expect(placementOf(cell("a")).rowStart).toBe("8");
  });

  it("mirrors the placement onto data attributes for the drag system to measure", () => {
    renderGrid([widget("a", "xl")], [at("a", 1, 1, 3, 1)]);
    const el = cell("a");
    expect([
      el.dataset.gridX,
      el.dataset.gridY,
      el.dataset.gridW,
      el.dataset.gridH,
    ]).toEqual(["1", "1", "3", "1"]);
  });
});

describe("the grid track set is fixed and four columns wide", () => {
  it("declares four equal columns and a fixed row height", () => {
    renderGrid([widget("a")], [at("a", 0, 0)]);
    const grid = screen.getByTestId("analytics-explicit-grid");
    expect(grid.style.gridTemplateColumns).toBe("repeat(4, minmax(0, 1fr))");
    expect(grid.style.getPropertyValue("--analytics-grid-row-height")).toBe(
      `${ANALYTICS_GRID_ROW_HEIGHT_PX}px`,
    );
    expect(grid.style.getPropertyValue("--analytics-grid-gap")).toBe(
      `${ANALYTICS_GRID_GAP_PX}px`,
    );
  });

  it("never uses dense auto-placement", () => {
    renderGrid([widget("a")], [at("a", 2, 1)]);
    const grid = screen.getByTestId("analytics-explicit-grid");
    expect(grid.style.gridAutoFlow).not.toContain("dense");
    expect(grid.className).not.toContain("dense");
  });

  it("bounds each cell so one tall card cannot redefine the row height", () => {
    renderGrid([widget("a")], [at("a", 0, 0)]);
    expect(cell("a").className).toContain("overflow-hidden");
    expect(cell("a").className).toContain("min-h-0");
  });

  it("counts a multi-row footprint's height as rows plus the gaps between them", () => {
    expect(rowSpanHeightPx(1)).toBe(ANALYTICS_GRID_ROW_HEIGHT_PX);
    expect(rowSpanHeightPx(2)).toBe(ANALYTICS_GRID_ROW_HEIGHT_PX * 2 + ANALYTICS_GRID_GAP_PX);
  });
});

describe("deliberate gaps survive", () => {
  it("leaves an empty column between two widgets", () => {
    //  A | · | B | B
    //  C | · | B | B
    const widgets = [widget("A"), widget("B", "l"), widget("C")];
    renderGrid(widgets, [at("A", 0, 0), at("B", 2, 0, 2, 2), at("C", 0, 1)]);
    expect(placementOf(cell("A")).columnStart).toBe("1");
    expect(placementOf(cell("C")).columnStart).toBe("1");
    expect(placementOf(cell("B")).columnStart).toBe("3");
    // Nothing was moved into column 2 on either row.
    const occupiedColumn2 = screen
      .getAllByTestId(/^analytics-grid-cell-/)
      .filter((el) => el.style.gridColumnStart === "2");
    expect(occupiedColumn2).toHaveLength(0);
  });

  it("leaves an empty row area", () => {
    renderGrid([widget("a"), widget("b")], [at("a", 0, 0), at("b", 0, 3)]);
    expect(placementOf(cell("b")).rowStart).toBe("4");
  });

  it("does not pull a later widget up into an earlier hole", () => {
    // First-fit would put `late` at 1,0. Explicit placement must not.
    renderGrid([widget("early"), widget("late")], [at("early", 0, 0), at("late", 2, 2)]);
    expect(placementOf(cell("late"))).toEqual({
      columnStart: "3",
      columnEnd: "span 1",
      rowStart: "3",
      rowEnd: "span 1",
    });
  });
});

describe("mixed footprints render at exactly their rectangle", () => {
  it.each([
    ["1×1", "s" as const, 1, 1],
    ["2×1", "m" as const, 2, 1],
    ["3×1", "xl" as const, 3, 1],
    ["4×1", "w" as const, 4, 1],
    ["1×2", "tall" as const, 1, 2],
    ["2×2", "l" as const, 2, 2],
  ])("renders a %s widget", (_label, size, w, h) => {
    renderGrid([widget("a", size)], [at("a", 0, 0, w, h)]);
    expect(placementOf(cell("a"))).toEqual({
      columnStart: "1",
      columnEnd: `span ${w}`,
      rowStart: "1",
      rowEnd: `span ${h}`,
    });
  });

  it("renders a representative mixed board with no two cells sharing a line pair", () => {
    // row 0: xl(0-2) + s(3)   row 1: m(0-1) + l(2-3, rows 1-2)
    // row 2: s(0) + tall(1, rows 2-3)
    const widgets = [
      widget("wide", "xl"),
      widget("corner"),
      widget("half", "m"),
      widget("big", "l"),
      widget("small"),
      widget("column", "tall"),
    ];
    renderGrid(widgets, [
      at("wide", 0, 0, 3, 1),
      at("corner", 3, 0),
      at("half", 0, 1, 2, 1),
      at("big", 2, 1, 2, 2),
      at("small", 0, 2),
      at("column", 1, 2, 1, 2),
    ]);
    const placements = screen
      .getAllByTestId(/^analytics-grid-cell-/)
      .map((el) => `${el.dataset.gridX},${el.dataset.gridY},${el.dataset.gridW},${el.dataset.gridH}`);
    expect(placements).toEqual([
      "0,0,3,1",
      "3,0,1,1",
      "0,1,2,1",
      "2,1,2,2",
      "0,2,1,1",
      "1,2,1,2",
    ]);
  });

  it("places a small widget below part of a wide widget", () => {
    renderGrid(
      [widget("wide", "w"), widget("under")],
      [at("wide", 0, 0, 4, 1), at("under", 2, 1)],
    );
    expect(placementOf(cell("under"))).toEqual({
      columnStart: "3",
      columnEnd: "span 1",
      rowStart: "2",
      rowEnd: "span 1",
    });
  });

  it("places a valid gap beside a large widget", () => {
    renderGrid([widget("big", "l"), widget("side")], [at("big", 0, 0, 2, 2), at("side", 3, 0)]);
    // Column 2 (index 2) is deliberately empty beside the 2×2.
    expect(placementOf(cell("side")).columnStart).toBe("4");
  });
});

describe("DOM order follows the visual reading order", () => {
  it("renders top-to-bottom, then left-to-right", () => {
    const widgets = [widget("bottom"), widget("topRight"), widget("topLeft")];
    renderGrid(widgets, [at("bottom", 0, 1), at("topRight", 2, 0), at("topLeft", 0, 0)]);
    expect(
      screen.getAllByTestId(/^analytics-grid-cell-/).map((el) => el.dataset.widgetId),
    ).toEqual(["topLeft", "topRight", "bottom"]);
  });

  it("keeps a widget's React identity when only its position changes", () => {
    const mounts: string[] = [];
    function Tracked({ id }: { id: string }) {
      const ref = useRef(0);
      useEffect(() => {
        mounts.push(id);
      }, [id]);
      ref.current += 1;
      return <span data-testid={`tracked-${id}`} />;
    }
    const widgets = [widget("a"), widget("b")];
    const renderTracked = (w: AnalyticsWidget) => <Tracked id={w.id} />;
    const { rerender } = render(
      <AnalyticsExplicitGrid
        widgets={widgets}
        layout={[at("a", 0, 0), at("b", 1, 0)]}
        renderWidget={renderTracked}
      />,
    );
    expect(mounts).toEqual(["a", "b"]);

    // Swap their columns: DOM order reverses, but keys are widget ids, so
    // neither component remounts — a layout move must not reset widget state.
    rerender(
      <AnalyticsExplicitGrid
        widgets={widgets}
        layout={[at("a", 1, 0), at("b", 0, 0)]}
        renderWidget={renderTracked}
      />,
    );
    expect(
      screen.getAllByTestId(/^analytics-grid-cell-/).map((el) => el.dataset.widgetId),
    ).toEqual(["b", "a"]);
    expect(mounts).toEqual(["a", "b"]); // no remount
  });

  it("does not mutate the arrays it was given", () => {
    const widgets = [widget("b"), widget("a")];
    const layout = [at("b", 1, 0), at("a", 0, 0)];
    renderGrid(widgets, layout);
    expect(widgets.map((w) => w.id)).toEqual(["b", "a"]);
    expect(layout.map((p) => p.widgetId)).toEqual(["b", "a"]);
  });
});

describe("the placeholder seam", () => {
  const widgets = [widget("a"), widget("b", "m")];
  const layout = [at("a", 0, 0), at("b", 2, 0, 2, 1)];

  it("renders nothing when there is no placeholder", () => {
    renderGrid(widgets, layout);
    expect(screen.queryByTestId(/^analytics-grid-placeholder/)).toBeNull();
  });

  it("occupies exactly the candidate footprint", () => {
    renderGrid(widgets, layout, { placeholder: { x: 1, y: 1, w: 2, h: 1, label: "2×1" } });
    const ph = screen.getByTestId("analytics-grid-placeholder");
    expect(placementOf(ph)).toEqual({
      columnStart: "2",
      columnEnd: "span 2",
      rowStart: "2",
      rowEnd: "span 1",
    });
    expect(ph.textContent).toContain("2×1");
  });

  it("takes a per-widget test id when it belongs to a widget being moved", () => {
    renderGrid(widgets, layout, { placeholder: { x: 0, y: 1, w: 1, h: 1, widgetId: "a" } });
    expect(screen.getByTestId("analytics-grid-placeholder-a")).toBeTruthy();
  });

  it("removes no widget and moves none — it is presentation only", () => {
    renderGrid(widgets, layout, { placeholder: { x: 0, y: 1, w: 1, h: 1 } });
    expect(screen.getAllByTestId(/^analytics-grid-cell-/)).toHaveLength(2);
    expect(placementOf(cell("a")).columnStart).toBe("1");
    expect(placementOf(cell("b")).columnStart).toBe("3");
  });

  it("may sit in an intentional empty gap without filling it permanently", () => {
    // Column 2 of row 0 is a deliberate hole in this board.
    renderGrid(widgets, layout, { placeholder: { x: 1, y: 0, w: 1, h: 1 } });
    expect(placementOf(screen.getByTestId("analytics-grid-placeholder")).columnStart).toBe("2");
  });

  it("does not change widget order when it moves", () => {
    const { rerender } = render(
      <AnalyticsExplicitGrid
        widgets={widgets}
        layout={layout}
        renderWidget={body}
        placeholder={{ x: 1, y: 0, w: 1, h: 1 }}
      />,
    );
    const before = screen.getAllByTestId(/^analytics-grid-cell-/).map((el) => el.dataset.widgetId);
    rerender(
      <AnalyticsExplicitGrid
        widgets={widgets}
        layout={layout}
        renderWidget={body}
        placeholder={{ x: 0, y: 3, w: 1, h: 1 }}
      />,
    );
    expect(
      screen.getAllByTestId(/^analytics-grid-cell-/).map((el) => el.dataset.widgetId),
    ).toEqual(before);
  });

  it("is inert to the pointer, so it can never be its own drop target", () => {
    renderGrid(widgets, layout, { placeholder: { x: 1, y: 1, w: 1, h: 1 } });
    const ph = screen.getByTestId("analytics-grid-placeholder");
    expect(ph.className).toContain("pointer-events-none");
    expect(ph.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("the overlay seam is preserved", () => {
  it("applies no transform to the grid, so a fixed overlay keeps viewport coordinates", () => {
    // A transformed ancestor would make `position: fixed` resolve against the
    // grid instead of the viewport, silently breaking S4's drag overlay.
    renderGrid([widget("a")], [at("a", 0, 0)]);
    const grid = screen.getByTestId("analytics-explicit-grid");
    for (const property of ["transform", "perspective", "filter", "backdrop-filter"]) {
      expect(grid.style.getPropertyValue(property)).toBe("");
    }
    // …and no utility class that would create one either.
    expect(grid.className).not.toMatch(/\b(transform|scale-|rotate-|translate-|filter|backdrop-)/);
  });

  it("makes the grid the offsetParent for grid-local pointer maths", () => {
    renderGrid([widget("a")], [at("a", 0, 0)]);
    expect(screen.getByTestId("analytics-explicit-grid").className).toContain("relative");
  });
});
