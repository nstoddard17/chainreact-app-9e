/** @jest-environment node */
import {
  ANALYTICS_CANONICAL_COLUMNS,
  placeWidget,
  validateLayout,
  type AnalyticsLayout,
  type GridRect,
  type LayoutResult,
  type PlacedWidget,
} from "@/core/analytics/layout";

/**
 * ANALYTICS-EXPLICIT-LAYOUT-S1-ENGINE-1 — the placement guarantees the
 * dashboard editor is being rebuilt on.
 *
 * Each test names the promise it protects, and asserts the resulting
 * RECTANGLES. None of them assert that a helper was called.
 */

const COLUMNS = ANALYTICS_CANONICAL_COLUMNS;
const OPTIONS = { columnCount: COLUMNS, collisionPolicy: "push-down" as const };

const at = (widgetId: string, x: number, y: number, w = 1, h = 1): PlacedWidget => ({
  widgetId,
  x,
  y,
  w,
  h,
});

function committed(result: LayoutResult): AnalyticsLayout {
  if (!result.ok) throw new Error(`expected a placement, got ${result.reason}: ${result.message}`);
  // Every success is a layout the product could commit as-is.
  expect(validateLayout(result.layout, COLUMNS)).toEqual({ ok: true });
  return result.layout;
}

function rectOf(layout: AnalyticsLayout, widgetId: string): GridRect {
  const found = layout.find((w) => w.widgetId === widgetId);
  if (!found) throw new Error(`no widget ${widgetId}`);
  return { x: found.x, y: found.y, w: found.w, h: found.h };
}

/** Every widget's rectangle, keyed by id — the whole board in one assertion. */
function board(layout: AnalyticsLayout): Record<string, GridRect> {
  return Object.fromEntries(layout.map((w) => [w.widgetId, { x: w.x, y: w.y, w: w.w, h: w.h }]));
}

// ── Placing into empty space ────────────────────────────────────────────────

describe("a widget can be placed into open space without disturbing anything", () => {
  it("places a small widget inside an open cell without moving unrelated widgets", () => {
    const layout = [at("a", 0, 0), at("b", 1, 0), at("mover", 0, 1)];
    const next = committed(placeWidget(layout, "mover", { x: 3, y: 0, w: 1, h: 1 }, OPTIONS));
    expect(board(next)).toEqual({
      a: { x: 0, y: 0, w: 1, h: 1 },
      b: { x: 1, y: 0, w: 1, h: 1 },
      mover: { x: 3, y: 0, w: 1, h: 1 },
    });
  });

  it("places a two-cell widget into an open two-cell rectangle", () => {
    const layout = [at("a", 0, 0, 2, 1), at("wide", 0, 1, 2, 1)];
    const next = committed(placeWidget(layout, "wide", { x: 2, y: 0, w: 2, h: 1 }, OPTIONS));
    expect(rectOf(next, "wide")).toEqual({ x: 2, y: 0, w: 2, h: 1 });
    expect(rectOf(next, "a")).toEqual({ x: 0, y: 0, w: 2, h: 1 });
  });

  it("places a widget into a gap on a lower row — the gap is a real destination", () => {
    // Row 1 columns 2-3 are empty; the old ordered model could not target them.
    const layout = [at("a", 0, 0, 4, 1), at("b", 0, 1, 2, 1), at("mover", 0, 2)];
    const next = committed(placeWidget(layout, "mover", { x: 2, y: 1, w: 1, h: 1 }, OPTIONS));
    expect(rectOf(next, "mover")).toEqual({ x: 2, y: 1, w: 1, h: 1 });
    expect(rectOf(next, "b")).toEqual({ x: 0, y: 1, w: 2, h: 1 });
  });

  it("places a widget flush against the rightmost valid column", () => {
    const layout = [at("mover", 0, 0, 2, 1)];
    const next = committed(placeWidget(layout, "mover", { x: 2, y: 0, w: 2, h: 1 }, OPTIONS));
    expect(rectOf(next, "mover")).toEqual({ x: 2, y: 0, w: 2, h: 1 });
  });

  it("refuses a footprint that would hang past the last column", () => {
    const layout = [at("mover", 0, 0, 2, 1)];
    const result = placeWidget(layout, "mover", { x: 3, y: 0, w: 2, h: 1 }, OPTIONS);
    expect(result).toMatchObject({ ok: false, reason: "exceeds-columns" });
  });

  it.each([
    ["a negative column", { x: -1, y: 0, w: 1, h: 1 }],
    ["a zero-width footprint", { x: 0, y: 0, w: 0, h: 1 }],
    ["a fractional row", { x: 0, y: 1.5, w: 1, h: 1 }],
  ])("refuses %s rather than rounding it into something else", (_name, candidate) => {
    const result = placeWidget([at("mover", 0, 0)], "mover", candidate, OPTIONS);
    expect(result).toMatchObject({ ok: false, reason: "invalid-rect" });
  });

  it("refuses to place a widget that is not on the board", () => {
    const result = placeWidget([at("a", 0, 0)], "ghost", { x: 1, y: 0, w: 1, h: 1 }, OPTIONS);
    expect(result).toMatchObject({ ok: false, reason: "unknown-widget" });
  });
});

// ── Moving a widget without changing its size ───────────────────────────────

describe("a widget moves to exactly the cell it was aimed at", () => {
  const layout = [at("mover", 1, 1), at("anchor", 3, 3)];

  it.each([
    ["left", { x: 0, y: 1 }],
    ["right", { x: 2, y: 1 }],
    ["up into an empty cell", { x: 1, y: 0 }],
    ["down", { x: 1, y: 2 }],
    ["across several cells at once", { x: 3, y: 0 }],
  ])("moves %s", (_direction, target) => {
    const next = committed(
      placeWidget(layout, "mover", { ...target, w: 1, h: 1 }, OPTIONS),
    );
    expect(rectOf(next, "mover")).toEqual({ ...target, w: 1, h: 1 });
    expect(rectOf(next, "anchor")).toEqual({ x: 3, y: 3, w: 1, h: 1 });
  });

  it("moves into a deliberate gap left by an earlier edit", () => {
    const gapped = [at("a", 0, 0), at("c", 2, 0), at("mover", 0, 2)];
    const next = committed(placeWidget(gapped, "mover", { x: 1, y: 0, w: 1, h: 1 }, OPTIONS));
    expect(board(next)).toEqual({
      a: { x: 0, y: 0, w: 1, h: 1 },
      c: { x: 2, y: 0, w: 1, h: 1 },
      mover: { x: 1, y: 0, w: 1, h: 1 },
    });
  });

  it("returns to exactly the starting board when moved out and back with nothing in the way", () => {
    const start: AnalyticsLayout = [at("mover", 0, 0), at("other", 2, 0)];
    const out = committed(placeWidget(start, "mover", { x: 3, y: 2, w: 1, h: 1 }, OPTIONS));
    const back = committed(placeWidget(out, "mover", { x: 0, y: 0, w: 1, h: 1 }, OPTIONS));
    expect(back).toEqual(start);
  });

  it("does NOT pull displaced widgets back up when the mover returns — gaps are kept, not undone", () => {
    // Honest statement of the no-compaction policy: an undo is the caller's
    // job (restore the previous layout), not something placement fakes.
    const start = [at("mover", 0, 2), at("victim", 0, 0)];
    const out = committed(placeWidget(start, "mover", { x: 0, y: 0, w: 1, h: 1 }, OPTIONS));
    expect(rectOf(out, "victim")).toEqual({ x: 0, y: 1, w: 1, h: 1 });
    const back = committed(placeWidget(out, "mover", { x: 0, y: 2, w: 1, h: 1 }, OPTIONS));
    expect(rectOf(back, "victim")).toEqual({ x: 0, y: 1, w: 1, h: 1 });
    expect(rectOf(back, "mover")).toEqual({ x: 0, y: 2, w: 1, h: 1 });
  });
});

// ── Mixed sizes ─────────────────────────────────────────────────────────────

describe("mixed-size placements displace occupants downward, never sideways", () => {
  it("pushes a wide widget down when a small widget takes part of its footprint", () => {
    const layout = [at("wide", 0, 0, 3, 1), at("small", 0, 1)];
    const next = committed(placeWidget(layout, "small", { x: 1, y: 0, w: 1, h: 1 }, OPTIONS));
    expect(board(next)).toEqual({
      small: { x: 1, y: 0, w: 1, h: 1 },
      wide: { x: 0, y: 1, w: 3, h: 1 },
    });
  });

  it("pushes all three small widgets down when a wide widget lands on their row", () => {
    const layout = [at("p", 0, 0), at("q", 1, 0), at("r", 2, 0), at("wide", 0, 1, 3, 1)];
    const next = committed(placeWidget(layout, "wide", { x: 0, y: 0, w: 3, h: 1 }, OPTIONS));
    expect(board(next)).toEqual({
      wide: { x: 0, y: 0, w: 3, h: 1 },
      p: { x: 0, y: 1, w: 1, h: 1 },
      q: { x: 1, y: 1, w: 1, h: 1 },
      r: { x: 2, y: 1, w: 1, h: 1 },
    });
  });

  it("displaces only the widgets it actually overlaps in partially occupied space", () => {
    // `keep` sits at column 3 and is never in the 2-wide candidate's way.
    const layout = [at("hit", 0, 0), at("keep", 3, 0), at("mover", 0, 2, 2, 1)];
    const next = committed(placeWidget(layout, "mover", { x: 0, y: 0, w: 2, h: 1 }, OPTIONS));
    expect(board(next)).toEqual({
      mover: { x: 0, y: 0, w: 2, h: 1 },
      hit: { x: 0, y: 1, w: 1, h: 1 },
      keep: { x: 3, y: 0, w: 1, h: 1 },
    });
  });

  it("carries a wide widget across a row boundary and pushes only that row's occupants", () => {
    const layout = [at("top", 0, 0, 4, 1), at("a", 0, 1), at("b", 1, 1), at("wide", 0, 2, 4, 1)];
    const next = committed(placeWidget(layout, "wide", { x: 0, y: 1, w: 4, h: 1 }, OPTIONS));
    expect(board(next)).toEqual({
      top: { x: 0, y: 0, w: 4, h: 1 },
      wide: { x: 0, y: 1, w: 4, h: 1 },
      a: { x: 0, y: 2, w: 1, h: 1 },
      b: { x: 1, y: 2, w: 1, h: 1 },
    });
  });

  it("places a small widget beside a wide widget when a valid cell exists, moving nothing", () => {
    const layout = [at("wide", 0, 0, 3, 1), at("small", 0, 2)];
    const next = committed(placeWidget(layout, "small", { x: 3, y: 0, w: 1, h: 1 }, OPTIONS));
    expect(board(next)).toEqual({
      wide: { x: 0, y: 0, w: 3, h: 1 },
      small: { x: 3, y: 0, w: 1, h: 1 },
    });
  });

  it("resolves the owner's worked example exactly", () => {
    // A spans columns 0-2 on row 0; B and C sit side by side on row 1. A 3-wide
    // widget is moved into row 1: it keeps row 1, B and C go down, in order,
    // and neither slides sideways to fill the opening at column 3.
    const layout = [at("A", 0, 0, 3, 1), at("B", 0, 1), at("C", 1, 1), at("D", 0, 2, 3, 1)];
    const next = committed(placeWidget(layout, "D", { x: 0, y: 1, w: 3, h: 1 }, OPTIONS));
    expect(board(next)).toEqual({
      A: { x: 0, y: 0, w: 3, h: 1 },
      D: { x: 0, y: 1, w: 3, h: 1 },
      B: { x: 0, y: 2, w: 1, h: 1 },
      C: { x: 1, y: 2, w: 1, h: 1 },
    });
  });

  it("cascades a displacement through a stack without ever overlapping", () => {
    const layout = [at("a", 0, 0), at("b", 0, 1), at("c", 0, 2), at("wide", 0, 3, 4, 1)];
    const next = committed(placeWidget(layout, "wide", { x: 0, y: 0, w: 4, h: 1 }, OPTIONS));
    expect(board(next)).toEqual({
      wide: { x: 0, y: 0, w: 4, h: 1 },
      a: { x: 0, y: 1, w: 1, h: 1 },
      b: { x: 0, y: 2, w: 1, h: 1 },
      c: { x: 0, y: 3, w: 1, h: 1 },
    });
  });

  it("keeps the relative vertical order of everything it displaces", () => {
    const layout = [at("first", 0, 0), at("second", 0, 1), at("tall", 3, 0, 1, 1)];
    const next = committed(placeWidget(layout, "tall", { x: 0, y: 0, w: 1, h: 2 }, OPTIONS));
    expect(rectOf(next, "first").y).toBeLessThan(rectOf(next, "second").y);
  });
});

// ── The policy itself ───────────────────────────────────────────────────────

describe("the push-down policy holds for every placement", () => {
  const crowded: AnalyticsLayout = [
    at("a", 0, 0, 2, 1),
    at("b", 2, 0, 2, 1),
    at("c", 0, 1),
    at("d", 1, 1, 3, 1),
    at("mover", 0, 2, 2, 2),
  ];

  it("never moves a widget upward", () => {
    const next = committed(placeWidget(crowded, "mover", { x: 0, y: 0, w: 2, h: 2 }, OPTIONS));
    for (const before of crowded) {
      if (before.widgetId === "mover") continue;
      expect(rectOf(next, before.widgetId).y).toBeGreaterThanOrEqual(before.y);
    }
  });

  it("never changes any widget's column", () => {
    const next = committed(placeWidget(crowded, "mover", { x: 0, y: 0, w: 2, h: 2 }, OPTIONS));
    for (const before of crowded) {
      if (before.widgetId === "mover") continue;
      expect(rectOf(next, before.widgetId).x).toBe(before.x);
    }
  });

  it("never compacts: the cells a widget vacates stay empty", () => {
    const layout = [at("top", 0, 0), at("mover", 0, 3)];
    const next = committed(placeWidget(layout, "mover", { x: 3, y: 3, w: 1, h: 1 }, OPTIONS));
    // Nothing rose to fill rows 1-2, and `top` did not slide down or across.
    expect(board(next)).toEqual({
      top: { x: 0, y: 0, w: 1, h: 1 },
      mover: { x: 3, y: 3, w: 1, h: 1 },
    });
  });

  it("lands the candidate on the exact rectangle requested, even inside a crowd", () => {
    const next = committed(placeWidget(crowded, "mover", { x: 1, y: 0, w: 2, h: 2 }, OPTIONS));
    expect(rectOf(next, "mover")).toEqual({ x: 1, y: 0, w: 2, h: 2 });
  });

  it("leaves untouched widgets identical by reference, so callers can tell what moved", () => {
    const layout = [at("far", 3, 6), at("hit", 0, 0), at("mover", 0, 2)];
    const result = placeWidget(layout, "mover", { x: 0, y: 0, w: 1, h: 1 }, OPTIONS);
    const next = committed(result);
    expect(next.find((w) => w.widgetId === "far")).toBe(layout[0]);
    expect(next.find((w) => w.widgetId === "hit")).not.toBe(layout[1]);
  });
});

// ── Determinism and immutability ────────────────────────────────────────────

describe("the engine is deterministic and never touches what it was given", () => {
  const layout: AnalyticsLayout = [at("a", 0, 0, 2, 1), at("b", 2, 0), at("mover", 0, 1, 3, 1)];
  const candidate = { x: 0, y: 0, w: 3, h: 1 };

  it("does not mutate the caller's array or widget objects", () => {
    const snapshot = JSON.parse(JSON.stringify(layout)) as unknown;
    placeWidget(layout, "mover", candidate, OPTIONS);
    expect(JSON.parse(JSON.stringify(layout))).toEqual(snapshot);
  });

  it("produces deeply equal output for repeated identical calls", () => {
    const once = committed(placeWidget(layout, "mover", candidate, OPTIONS));
    const twice = committed(placeWidget(layout, "mover", candidate, OPTIONS));
    expect(twice).toEqual(once);
  });

  it("is stable under re-application — placing the same widget where it already is changes nothing", () => {
    const once = committed(placeWidget(layout, "mover", candidate, OPTIONS));
    const again = committed(placeWidget(once, "mover", candidate, OPTIONS));
    expect(again).toEqual(once);
  });

  it("returns widgets in the caller's array order, so React keys do not churn", () => {
    const next = committed(placeWidget(layout, "mover", candidate, OPTIONS));
    expect(next.map((w) => w.widgetId)).toEqual(["a", "b", "mover"]);
  });

  it("does not depend on the array order it was handed", () => {
    const reversed = [...layout].reverse();
    const fromOriginal = committed(placeWidget(layout, "mover", candidate, OPTIONS));
    const fromReversed = committed(placeWidget(reversed, "mover", candidate, OPTIONS));
    expect(board(fromReversed)).toEqual(board(fromOriginal));
  });

  it("refuses a board containing the same widget twice rather than guessing", () => {
    const duplicated = [at("a", 0, 0), at("a", 2, 0), at("mover", 0, 1)];
    const result = placeWidget(duplicated, "mover", { x: 0, y: 2, w: 1, h: 1 }, OPTIONS);
    expect(result).toMatchObject({ ok: false, reason: "duplicate-id" });
  });
});
