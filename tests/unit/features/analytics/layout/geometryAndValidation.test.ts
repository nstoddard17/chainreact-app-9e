import {
  fitsWithinColumns,
  isWellFormedRect,
  lowestBottom,
  rectsOverlap,
  validateLayout,
  type AnalyticsLayout,
} from "@/features/analytics/layout";

/**
 * ANALYTICS-EXPLICIT-LAYOUT-S1-ENGINE-1 — the two guarantees every other engine
 * operation is built on: what counts as "in the way", and what counts as a
 * layout the product is willing to commit.
 */

const rect = (x: number, y: number, w = 1, h = 1) => ({ x, y, w, h });
const at = (widgetId: string, x: number, y: number, w = 1, h = 1) => ({ widgetId, x, y, w, h });

describe("two widgets are only in each other's way when they share a cell", () => {
  it("treats side-by-side widgets as neighbours, not a collision", () => {
    // The 2×1 ends at column 2; the 1×1 starts at column 2.
    expect(rectsOverlap(rect(0, 0, 2, 1), rect(2, 0, 1, 1))).toBe(false);
  });

  it("treats stacked widgets as neighbours, not a collision", () => {
    expect(rectsOverlap(rect(0, 0, 1, 2), rect(0, 2, 1, 1))).toBe(false);
  });

  it("collides when the footprints partly intersect", () => {
    expect(rectsOverlap(rect(0, 0, 2, 1), rect(1, 0, 2, 1))).toBe(true);
  });

  it("collides when one footprint sits entirely inside another", () => {
    expect(rectsOverlap(rect(0, 0, 4, 2), rect(1, 1, 1, 1))).toBe(true);
  });

  it("collides with itself", () => {
    expect(rectsOverlap(rect(1, 1, 2, 2), rect(1, 1, 2, 2))).toBe(true);
  });

  it("does not collide with a widget on a different row entirely", () => {
    expect(rectsOverlap(rect(0, 0, 4, 1), rect(0, 3, 4, 1))).toBe(false);
  });
});

describe("a rectangle the engine will accept", () => {
  it("accepts a whole block of cells at a non-negative origin", () => {
    expect(isWellFormedRect(rect(0, 0, 1, 1))).toBe(true);
    expect(isWellFormedRect(rect(3, 7, 1, 2))).toBe(true);
  });

  it.each([
    ["a fractional origin", { x: 0.5, y: 0, w: 1, h: 1 }],
    ["a fractional span", { x: 0, y: 0, w: 1.5, h: 1 }],
    ["a negative column", { x: -1, y: 0, w: 1, h: 1 }],
    ["a negative row", { x: 0, y: -1, w: 1, h: 1 }],
    ["zero width", { x: 0, y: 0, w: 0, h: 1 }],
    ["zero height", { x: 0, y: 0, w: 1, h: 0 }],
  ])("refuses %s", (_name, bad) => {
    expect(isWellFormedRect(bad)).toBe(false);
  });

  it("fits across the board only when its right edge lands on or inside the last column", () => {
    expect(fitsWithinColumns(rect(2, 0, 2, 1), 4)).toBe(true); // ends exactly at 4
    expect(fitsWithinColumns(rect(3, 0, 2, 1), 4)).toBe(false); // ends at 5
  });

  it("reports the first row below everything placed", () => {
    expect(lowestBottom([])).toBe(0);
    expect(lowestBottom([rect(0, 0, 1, 1), rect(1, 2, 1, 2)])).toBe(4);
  });
});

describe("a layout the product is willing to commit", () => {
  const columns = 4;

  it("accepts a board whose widgets tile without touching", () => {
    const layout: AnalyticsLayout = [at("a", 0, 0, 2, 1), at("b", 2, 0, 2, 1), at("c", 0, 1, 1, 2)];
    expect(validateLayout(layout, columns)).toEqual({ ok: true });
  });

  it("accepts a board with deliberate gaps — an empty cell is not a defect", () => {
    const layout: AnalyticsLayout = [at("a", 0, 0), at("c", 3, 2)];
    expect(validateLayout(layout, columns)).toEqual({ ok: true });
  });

  it("accepts an empty board", () => {
    expect(validateLayout([], columns)).toEqual({ ok: true });
  });

  it("rejects the same widget appearing twice", () => {
    const result = validateLayout([at("a", 0, 0), at("a", 2, 0)], columns);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.problems.map((p) => p.code)).toContain("duplicate-id");
  });

  it("rejects a widget placed off the left or top edge", () => {
    const result = validateLayout([at("a", -1, 0), at("b", 1, -2)], columns);
    expect(result.ok).toBe(false);
    const codes = !result.ok ? result.problems.map((p) => p.code) : [];
    expect(codes.filter((c) => c === "negative-coordinate")).toHaveLength(2);
  });

  it("rejects a widget that spans no cells", () => {
    const result = validateLayout([at("a", 0, 0, 0, 1)], columns);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.problems.map((p) => p.code)).toContain("invalid-size");
  });

  it("rejects a widget hanging past the right edge", () => {
    const result = validateLayout([at("a", 3, 0, 2, 1)], columns);
    expect(result.ok).toBe(false);
    const problem = !result.ok ? result.problems[0]! : null;
    expect(problem?.code).toBe("exceeds-columns");
    expect(problem?.widgetIds).toEqual(["a"]);
  });

  it("rejects two widgets occupying the same cells, and names both", () => {
    const result = validateLayout([at("a", 0, 0, 3, 1), at("b", 2, 0, 2, 1)], 5);
    expect(result.ok).toBe(false);
    const overlap = !result.ok ? result.problems.find((p) => p.code === "overlap") : undefined;
    expect(overlap?.widgetIds).toEqual(["a", "b"]);
  });

  it("reports every problem on the board, not just the first", () => {
    const result = validateLayout([at("a", -1, 0), at("b", 3, 0, 3, 1), at("b", 0, 5)], columns);
    expect(result.ok).toBe(false);
    const codes = !result.ok ? new Set(result.problems.map((p) => p.code)) : new Set();
    expect(codes).toEqual(new Set(["negative-coordinate", "exceeds-columns", "duplicate-id"]));
  });

  it("never throws on a malformed board — a fractional rectangle is reported, not crashed on", () => {
    const result = validateLayout([{ widgetId: "a", x: 0.5, y: 0, w: 1, h: 1 }], columns);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.problems.map((p) => p.code)).toEqual(["non-integer"]);
  });
});
