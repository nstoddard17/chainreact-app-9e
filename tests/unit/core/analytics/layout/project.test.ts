/** @jest-environment node */
import {
  ANALYTICS_CANONICAL_MIN_WIDTH_PX,
  ANALYTICS_MIN_CELL_WIDTH_PX,
  columnsForContainerWidth,
  projectLayoutToColumns,
  validateLayout,
  type AnalyticsColumnCount,
  type AnalyticsLayout,
  type PlacedWidget,
} from "@/core/analytics/layout";

/**
 * ANALYTICS-EXPLICIT-LAYOUT-S5-RESPONSIVE-PROJECTION-1 — the projection.
 *
 * One layout is persisted; narrow screens get a derived picture of it. The
 * guarantee these tests protect is the asymmetry: at four columns the canonical
 * board is reproduced EXACTLY (gaps and all, because those gaps are authored
 * intent), and below four the projection may compact — safely, because it can
 * never travel back into the canonical rectangles.
 */

const at = (widgetId: string, x: number, y: number, w = 1, h = 1): PlacedWidget => ({
  widgetId,
  x,
  y,
  w,
  h,
});

const board = (layout: AnalyticsLayout) =>
  layout.map((p) => `${p.widgetId}@${p.x},${p.y},${p.w},${p.h}`);

function projected(layout: AnalyticsLayout, columns: AnalyticsColumnCount): AnalyticsLayout {
  const result = projectLayoutToColumns(layout, columns);
  if (!result.ok) throw new Error(`expected a projection, got ${result.reason}`);
  expect(validateLayout(result.layout, columns)).toEqual({ ok: true });
  return result.layout;
}

/**
 *   A A | B | ·
 *   C   | B | D      ← B is 1×2, column 2 of row 0 is a deliberate gap
 */
const CANONICAL: AnalyticsLayout = [
  at("A", 0, 0, 2, 1),
  at("B", 2, 0, 1, 2),
  at("C", 0, 1, 1, 1),
  at("D", 3, 1, 1, 1),
];

// ── Column selection ────────────────────────────────────────────────────────

describe("how many columns a container can show", () => {
  const pitch = ANALYTICS_MIN_CELL_WIDTH_PX + 14;

  it.each([
    ["one, below two usable cells", pitch * 2 - 15, 1],
    ["two, when exactly two fit", pitch * 2 - 14, 2],
    ["three, when exactly three fit", pitch * 3 - 14, 3],
    ["four, when exactly four fit", pitch * 4 - 14, 4],
  ])("returns %s", (_name, width, expected) => {
    expect(columnsForContainerWidth(width)).toBe(expected);
  });

  it("clamps an enormous container to the canonical four", () => {
    expect(columnsForContainerWidth(99_999)).toBe(4);
  });

  it("never returns zero for a tiny container", () => {
    expect(columnsForContainerWidth(50)).toBe(1);
    expect(columnsForContainerWidth(1)).toBe(1);
  });

  it.each([0, -100, Number.NaN, Number.POSITIVE_INFINITY])(
    "falls back to canonical for an unusable width (%p)",
    (width) => {
      // A brief too-wide board on a phone is honest; a brief phone layout on a
      // desktop reads as broken.
      expect(columnsForContainerWidth(width)).toBe(4);
    },
  );

  it("publishes the width the four-column editing surface needs", () => {
    expect(ANALYTICS_CANONICAL_MIN_WIDTH_PX).toBe(ANALYTICS_MIN_CELL_WIDTH_PX * 4 + 14 * 3);
    expect(columnsForContainerWidth(ANALYTICS_CANONICAL_MIN_WIDTH_PX)).toBe(4);
    expect(columnsForContainerWidth(ANALYTICS_CANONICAL_MIN_WIDTH_PX - 1)).toBe(3);
  });
});

// ── Four columns: identity ──────────────────────────────────────────────────

describe("at four columns the canonical board is reproduced exactly", () => {
  it("returns the same rectangles, by reference", () => {
    const result = projectLayoutToColumns(CANONICAL, 4);
    expect(result.ok && result.layout).toBe(CANONICAL);
  });

  it("keeps the deliberate gap — authored intent is not compacted away", () => {
    const out = projected(CANONICAL, 4);
    const occupied = new Set(out.flatMap((p) => [`${p.x},${p.y}`]));
    expect(occupied.has("2,0")).toBe(true); // B starts there
    // Nothing was moved into row 0 column 3, which is empty on purpose.
    expect(out.some((p) => p.x === 3 && p.y === 0)).toBe(false);
  });

  it("does not reorder the canonical array", () => {
    expect(projected(CANONICAL, 4).map((p) => p.widgetId)).toEqual(["A", "B", "C", "D"]);
  });
});

// ── Narrow projections ──────────────────────────────────────────────────────

describe("three columns", () => {
  it("clamps a 4-wide widget to the full three, and leaves a 3-wide alone", () => {
    const wide: AnalyticsLayout = [at("full", 0, 0, 4, 1), at("three", 0, 1, 3, 1)];
    expect(board(projected(wide, 3))).toEqual(["full@0,0,3,1", "three@0,1,3,1"]);
  });

  it("preserves heights and places every widget without overlap", () => {
    const out = projected(CANONICAL, 3);
    expect(out).toHaveLength(4);
    expect(out.find((p) => p.widgetId === "B")?.h).toBe(2);
  });

  it("follows canonical reading order, not the persisted array order", () => {
    // The array is D, C, B, A but the board reads A, B, C, D.
    const shuffled: AnalyticsLayout = [
      at("D", 3, 1),
      at("C", 0, 1),
      at("B", 2, 0, 1, 2),
      at("A", 0, 0, 2, 1),
    ];
    expect(projected(shuffled, 3).map((p) => p.widgetId)).toEqual(["A", "B", "C", "D"]);
  });

  it("is deterministic and does not mutate the canonical layout", () => {
    const snapshot = JSON.parse(JSON.stringify(CANONICAL)) as unknown;
    const once = projected(CANONICAL, 3);
    const twice = projected(CANONICAL, 3);
    expect(twice).toEqual(once);
    expect(JSON.parse(JSON.stringify(CANONICAL))).toEqual(snapshot);
  });
});

describe("two columns", () => {
  it("clamps 3-wide and 4-wide widgets to both columns", () => {
    const wide: AnalyticsLayout = [at("four", 0, 0, 4, 1), at("three", 0, 1, 3, 1)];
    expect(board(projected(wide, 2))).toEqual(["four@0,0,2,1", "three@0,1,2,1"]);
  });

  it("keeps a 1×2's height and places a 2×2 correctly", () => {
    const layout: AnalyticsLayout = [at("tall", 0, 0, 1, 2), at("big", 2, 0, 2, 2)];
    const out = projected(layout, 2);
    expect(out.find((p) => p.widgetId === "tall")).toMatchObject({ w: 1, h: 2 });
    expect(out.find((p) => p.widgetId === "big")).toMatchObject({ w: 2, h: 2 });
  });

  it("loses no widget and overlaps nothing", () => {
    const out = projected(CANONICAL, 2);
    expect(new Set(out.map((p) => p.widgetId))).toEqual(new Set(["A", "B", "C", "D"]));
  });
});

describe("one column", () => {
  it("makes every widget one wide while keeping heights", () => {
    const out = projected(CANONICAL, 1);
    expect(out.every((p) => p.w === 1)).toBe(true);
    expect(out.find((p) => p.widgetId === "B")?.h).toBe(2);
  });

  it("stacks in canonical reading order with no wasted rows", () => {
    const out = projected(CANONICAL, 1);
    expect(board(out)).toEqual(["A@0,0,1,1", "B@0,1,1,2", "C@0,3,1,1", "D@0,4,1,1"]);
  });
});

describe("projection invariants hold for every target width", () => {
  it.each([1, 2, 3, 4] as const)("at %i columns", (columns) => {
    const out = projected(CANONICAL, columns);
    expect(out).toHaveLength(CANONICAL.length);
    expect(new Set(out.map((p) => p.widgetId))).toEqual(
      new Set(CANONICAL.map((p) => p.widgetId)),
    );
    for (const p of out) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.w).toBeGreaterThanOrEqual(1);
      expect(p.h).toBeGreaterThanOrEqual(1);
      expect(p.x + p.w).toBeLessThanOrEqual(columns);
    }
  });

  it("refuses to project an invalid canonical layout rather than guessing", () => {
    const overlapping: AnalyticsLayout = [at("a", 0, 0, 2, 1), at("b", 1, 0, 2, 1)];
    expect(projectLayoutToColumns(overlapping, 2)).toMatchObject({ ok: false });
  });

  it("projects an empty board to an empty board", () => {
    expect(projected([], 1)).toEqual([]);
  });

  it("round-trips: narrowing and widening restores the canonical rectangles", () => {
    projected(CANONICAL, 1);
    projected(CANONICAL, 2);
    projected(CANONICAL, 3);
    // Canonical is the source every time; nothing accumulated.
    expect(projectLayoutToColumns(CANONICAL, 4).ok && board(CANONICAL)).toEqual(
      board(CANONICAL),
    );
  });
});
