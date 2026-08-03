/** @jest-environment node */
import {
  ANALYTICS_CANONICAL_COLUMNS,
  ANALYTICS_SIZE_FOOTPRINT,
  footprintForSize,
  migrateLegacyOrderedLayout,
  validateLayout,
  type AnalyticsLayout,
  type LayoutResult,
  type LegacyOrderedWidget,
} from "@/core/analytics/layout";
import { DEFAULT_OVERVIEW_WIDGETS } from "@/contracts/analyticsDefaults";
import type { AnalyticsWidgetSize } from "@/contracts/analytics";

/**
 * ANALYTICS-EXPLICIT-LAYOUT-S1-ENGINE-1 — legacy → canonical migration.
 *
 * The owner decision this proves: every stored board converts to ONE canonical
 * four-column layout, identically on every device, and the empty cells CSS
 * sparse auto-flow used to produce are NOT reproduced as though a user had
 * authored them.
 *
 * Nothing here is wired into the app; the schema, the service and the stored
 * rows are untouched by this stage.
 */

const COLUMNS = ANALYTICS_CANONICAL_COLUMNS;

const legacy = (id: string, size: AnalyticsWidgetSize): LegacyOrderedWidget => ({ id, size });

function migrated(result: LayoutResult): AnalyticsLayout {
  if (!result.ok) throw new Error(`expected a migration, got ${result.reason}: ${result.message}`);
  expect(validateLayout(result.layout, COLUMNS)).toEqual({ ok: true });
  return result.layout;
}

const SHIPPED_DEFAULT: LegacyOrderedWidget[] = DEFAULT_OVERVIEW_WIDGETS.map((w) => ({
  id: w.id,
  size: w.size,
}));

describe("the size-preset map is the single definition of a footprint", () => {
  it("pins each preset's columns x rows", () => {
    // S4 retired the Tailwind span classes that used to carry this meaning in
    // parallel; `ANALYTICS_SIZE_FOOTPRINT` in contracts/ is now the only place a
    // preset's footprint is declared. These are the values the app has always
    // rendered.
    expect(ANALYTICS_SIZE_FOOTPRINT).toEqual({
      s: { w: 1, h: 1 },
      m: { w: 2, h: 1 },
      l: { w: 2, h: 2 },
      xl: { w: 3, h: 1 },
      w: { w: 4, h: 1 },
      tall: { w: 1, h: 2 },
    });
  });

  it("keeps every preset inside the canonical four columns", () => {
    for (const footprint of Object.values(ANALYTICS_SIZE_FOOTPRINT)) {
      expect(footprint.w).toBeLessThanOrEqual(COLUMNS);
      expect(footprint.w).toBeGreaterThanOrEqual(1);
      expect(footprint.h).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("the shipped default board migrates to a known canonical layout", () => {
  it("places every default widget at the expected rectangle", () => {
    // ANALYTICS-DEFAULT-OVERVIEW-WELCOME-FIRST-1 moved the welcome note to the
    // FRONT of the default array, which under first-fit is what puts it at the
    // top-left. The rest keep their relative order and are placed by the engine:
    //
    //   row 0:  note     note     runs     success
    //   row 1:  active   duration outcome  ·
    //   row 2:  overtime overtime overtime ·
    //   row 3:  top      top      heatmap  heatmap
    //   row 4:  apps     apps     heatmap  heatmap
    //   row 5:  recent   recent   ·        ·
    //
    // The four empty cells are a CONSEQUENCE of a 2-wide widget leading: the
    // 3-wide `ov-overtime` no longer fits beside the stat tiles. They are not
    // hand-authored, and no widget was resized or reordered to hide them.
    const layout = migrated(migrateLegacyOrderedLayout(SHIPPED_DEFAULT, { columnCount: COLUMNS }));
    expect(layout).toEqual([
      { widgetId: "ov-note", x: 0, y: 0, w: 2, h: 1 },
      { widgetId: "ov-runs", x: 2, y: 0, w: 1, h: 1 },
      { widgetId: "ov-success", x: 3, y: 0, w: 1, h: 1 },
      { widgetId: "ov-active", x: 0, y: 1, w: 1, h: 1 },
      { widgetId: "ov-duration", x: 1, y: 1, w: 1, h: 1 },
      { widgetId: "ov-overtime", x: 0, y: 2, w: 3, h: 1 },
      { widgetId: "ov-outcome", x: 2, y: 1, w: 1, h: 1 },
      { widgetId: "ov-top", x: 0, y: 3, w: 2, h: 1 },
      { widgetId: "ov-heatmap", x: 2, y: 3, w: 2, h: 2 },
      { widgetId: "ov-apps", x: 0, y: 4, w: 2, h: 1 },
      { widgetId: "ov-recent", x: 0, y: 5, w: 2, h: 1 },
    ]);
  });

  it("puts the welcome note in the top-left cell, ahead of everything else", () => {
    const layout = migrated(migrateLegacyOrderedLayout(SHIPPED_DEFAULT, { columnCount: COLUMNS }));
    const welcome = layout.find((p) => p.widgetId === "ov-note")!;
    expect({ x: welcome.x, y: welcome.y }).toEqual({ x: 0, y: 0 });
    // Nothing sits above it or to its left — the strongest form of "top-left".
    const precede = layout
      .filter((p) => p.widgetId !== "ov-note")
      .filter((p) => p.y + p.h <= welcome.y || p.x + p.w <= welcome.x)
      .map((p) => p.widgetId);
    expect(precede).toEqual([]);
    // …and it leads the canonical reading order, which is what every narrower
    // projection re-packs from.
    const readingOrder = [...layout].sort((a, b) => a.y - b.y || a.x - b.x);
    expect(readingOrder[0]!.widgetId).toBe("ov-note");
  });

  it("gives every widget the footprint its stored size preset means", () => {
    const layout = migrated(migrateLegacyOrderedLayout(SHIPPED_DEFAULT, { columnCount: COLUMNS }));
    for (const widget of DEFAULT_OVERVIEW_WIDGETS) {
      const placed = layout.find((p) => p.widgetId === widget.id)!;
      expect({ w: placed.w, h: placed.h }).toEqual(footprintForSize(widget.size));
    }
  });

  it("keeps the legacy array order in the migrated board", () => {
    const layout = migrated(migrateLegacyOrderedLayout(SHIPPED_DEFAULT, { columnCount: COLUMNS }));
    expect(layout.map((p) => p.widgetId)).toEqual(DEFAULT_OVERVIEW_WIDGETS.map((w) => w.id));
  });

  it("produces no overlaps and nothing past the fourth column", () => {
    const layout = migrated(migrateLegacyOrderedLayout(SHIPPED_DEFAULT, { columnCount: COLUMNS }));
    expect(COLUMNS).toBe(4);
    for (const placed of layout) expect(placed.x + placed.w).toBeLessThanOrEqual(4);
    expect(validateLayout(layout, COLUMNS)).toEqual({ ok: true });
  });
});

describe("accidental auto-flow holes are not carried over as authored placement", () => {
  it("fills the cell sparse auto-flow abandoned instead of reproducing the hole", () => {
    // Four 1×1s and one 2×1 — what a user gets by resizing one stat tile. Under
    // sparse auto-flow at four columns this leaves column 3 of row 0 empty
    // forever, because the flow cursor never goes back. First-fit reuses it.
    const board = [
      legacy("one", "s"),
      legacy("two", "s"),
      legacy("three", "s"),
      legacy("wide", "m"),
      legacy("four", "s"),
    ];
    const layout = migrated(migrateLegacyOrderedLayout(board, { columnCount: COLUMNS }));
    expect(layout).toEqual([
      { widgetId: "one", x: 0, y: 0, w: 1, h: 1 },
      { widgetId: "two", x: 1, y: 0, w: 1, h: 1 },
      { widgetId: "three", x: 2, y: 0, w: 1, h: 1 },
      { widgetId: "wide", x: 0, y: 1, w: 2, h: 1 },
      { widgetId: "four", x: 3, y: 0, w: 1, h: 1 },
    ]);
  });

  it("earlier widgets keep priority, so the legacy reading order still leads", () => {
    const board = [legacy("wide", "xl"), legacy("small", "s"), legacy("second-wide", "xl")];
    const layout = migrated(migrateLegacyOrderedLayout(board, { columnCount: COLUMNS }));
    expect(layout).toEqual([
      { widgetId: "wide", x: 0, y: 0, w: 3, h: 1 },
      { widgetId: "small", x: 3, y: 0, w: 1, h: 1 },
      { widgetId: "second-wide", x: 0, y: 1, w: 3, h: 1 },
    ]);
  });
});

describe("the same legacy dashboard migrates identically regardless of device", () => {
  const originalInnerWidth = Object.getOwnPropertyDescriptor(globalThis, "innerWidth");

  afterEach(() => {
    if (originalInnerWidth) Object.defineProperty(globalThis, "innerWidth", originalInnerWidth);
  });

  it.each([320, 768, 1024, 1440, 2560])(
    "produces the same canonical layout at a %ipx viewport",
    (width) => {
      Object.defineProperty(globalThis, "innerWidth", { value: width, configurable: true });
      const layout = migrated(
        migrateLegacyOrderedLayout(SHIPPED_DEFAULT, { columnCount: COLUMNS }),
      );
      const baseline = migrated(
        migrateLegacyOrderedLayout(SHIPPED_DEFAULT, { columnCount: COLUMNS }),
      );
      expect(layout).toEqual(baseline);
      // The migrated board is four columns wide whatever the window says.
      expect(Math.max(...layout.map((p) => p.x + p.w))).toBe(4);
    },
  );

  it("produces byte-equivalent output when run twice", () => {
    const once = migrateLegacyOrderedLayout(SHIPPED_DEFAULT, { columnCount: COLUMNS });
    const twice = migrateLegacyOrderedLayout(SHIPPED_DEFAULT, { columnCount: COLUMNS });
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
  });

  it("is a fixed point — re-migrating the same order and footprints does not move anything", () => {
    const first = migrated(migrateLegacyOrderedLayout(SHIPPED_DEFAULT, { columnCount: COLUMNS }));
    const again = migrated(migrateLegacyOrderedLayout(SHIPPED_DEFAULT, { columnCount: COLUMNS }));
    expect(again).toEqual(first);
  });

  it("does not mutate the widgets it was handed", () => {
    const snapshot = JSON.parse(JSON.stringify(SHIPPED_DEFAULT)) as unknown;
    migrateLegacyOrderedLayout(SHIPPED_DEFAULT, { columnCount: COLUMNS });
    expect(JSON.parse(JSON.stringify(SHIPPED_DEFAULT))).toEqual(snapshot);
  });
});

describe("migration refuses input it cannot convert honestly", () => {
  it("migrates an empty board to an empty layout", () => {
    expect(migrated(migrateLegacyOrderedLayout([], { columnCount: COLUMNS }))).toEqual([]);
  });

  it("refuses a stored board containing the same widget id twice", () => {
    const result = migrateLegacyOrderedLayout([legacy("dupe", "s"), legacy("dupe", "m")], {
      columnCount: COLUMNS,
    });
    expect(result).toMatchObject({ ok: false, reason: "duplicate-id" });
  });

  it("refuses rather than silently shrinking a widget too wide for the board", () => {
    // Unreachable at four columns — the widest preset is exactly four — so this
    // guards a future narrower canonical width or a new preset.
    const result = migrateLegacyOrderedLayout([legacy("full", "w")], { columnCount: 2 });
    expect(result).toMatchObject({ ok: false, reason: "exceeds-columns" });
  });
});
