/** @jest-environment node */
import * as edit from "@/features/analytics/grid/layoutEditState";
import {
  candidateRectFor,
  gridMetricsFromWidth,
  sameRect,
} from "@/features/analytics/grid/candidateRect";
import {
  AnalyticsWidgetSchema,
  type AnalyticsWidget,
  type AnalyticsWidgetSize,
} from "@/contracts/analytics";
import type { AnalyticsLayout, PlacedWidget } from "@/core/analytics/layout";

/**
 * ANALYTICS-EXPLICIT-LAYOUT-S4-EDITOR-INTEGRATION-1 — the editor's rules.
 *
 * Everything that decides WHAT the editor does is pure, so it is asserted here
 * on real values rather than through the DOM. The rule that matters most is the
 * last one: converting a legacy dashboard to explicit storage is a one-way door,
 * so it must be earned by an actual rearrangement — never by loading the page,
 * renaming a widget, or dragging something and putting it back.
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

const board = (layout: AnalyticsLayout) =>
  Object.fromEntries(layout.map((p) => [p.widgetId, `${p.x},${p.y},${p.w},${p.h}`]));

/** A legacy board: three widgets, derived rectangles, nothing persisted. */
function legacySession() {
  const widgets = [widget("a"), widget("b", "m"), widget("c")];
  const layout = [at("a", 0, 0), at("b", 1, 0, 2, 1), at("c", 3, 0)];
  return edit.beginEdit(widgets, layout, "legacy-derived");
}

function explicitSession() {
  const widgets = [widget("a"), widget("b", "m")];
  const layout = [at("a", 3, 0), at("b", 0, 2, 2, 1)];
  return edit.beginEdit(widgets, layout, "persisted");
}

// ── Session lifecycle ───────────────────────────────────────────────────────

describe("entering and leaving an edit session", () => {
  it("starts working state as a copy of saved state", () => {
    const s = legacySession();
    expect(board(s.workingLayout)).toEqual(board(s.savedLayout));
    expect(s.workingWidgets).not.toBe(s.savedWidgets);
    expect(s.workingLayout[0]).not.toBe(s.savedLayout[0]);
  });

  it("cancel throws away every working change", () => {
    let s = legacySession();
    s = edit.commitLayout(s, [at("a", 0, 3), at("b", 1, 0, 2, 1), at("c", 3, 0)]);
    s = edit.updateWidget(s, "a", { title: "Renamed" });
    const restored = edit.cancelEdit(s);
    expect(board(restored.workingLayout)).toEqual(board(restored.savedLayout));
    expect(restored.workingWidgets.find((w) => w.id === "a")?.title).toBe("a");
  });

  it("a successful save becomes the new saved state, with no pending edits left", () => {
    let s = legacySession();
    s = edit.commitLayout(s, [at("a", 0, 3), at("b", 1, 0, 2, 1), at("c", 3, 0)]);
    const after = edit.afterSave(s, s.workingWidgets, s.workingLayout, "persisted");
    expect(edit.isLayoutDirty(after)).toBe(false);
    expect(after.layoutSource).toBe("persisted");
    expect(board(after.savedLayout)["a"]).toBe("0,3,1,1");
  });
});

// ── Dirty state ─────────────────────────────────────────────────────────────

describe("the board is only dirty when the arrangement really differs", () => {
  it("is clean before anything happens", () => {
    expect(edit.isLayoutDirty(legacySession())).toBe(false);
  });

  it("is dirty after a widget moves", () => {
    const s = edit.commitLayout(legacySession(), [
      at("a", 0, 1),
      at("b", 1, 0, 2, 1),
      at("c", 3, 0),
    ]);
    expect(edit.isLayoutDirty(s)).toBe(true);
  });

  it("is CLEAN again once the arrangement is restored — dirtiness is not sticky", () => {
    let s = legacySession();
    s = edit.commitLayout(s, [at("a", 0, 1), at("b", 1, 0, 2, 1), at("c", 3, 0)]);
    expect(edit.isLayoutDirty(s)).toBe(true);
    s = edit.commitLayout(s, [at("a", 0, 0), at("b", 1, 0, 2, 1), at("c", 3, 0)]);
    expect(edit.isLayoutDirty(s)).toBe(false);
  });

  it("compares rectangles, not array identity or order", () => {
    const s = legacySession();
    const reordered = edit.commitLayout(s, [...s.savedLayout].reverse().map((p) => ({ ...p })));
    expect(edit.isLayoutDirty(reordered)).toBe(false);
  });

  it("a title change is content-dirty but not layout-dirty", () => {
    const s = edit.updateWidget(legacySession(), "a", { title: "Renamed" });
    expect(edit.isLayoutDirty(s)).toBe(false);
    expect(edit.isContentDirty(s)).toBe(true);
  });

  it("a config change is content-dirty but not layout-dirty", () => {
    const s = edit.updateWidget(legacySession(), "a", {
      config: { source: "any", metric: "success_rate" },
    });
    expect(edit.isLayoutDirty(s)).toBe(false);
    expect(edit.isContentDirty(s)).toBe(true);
  });
});

// ── Persistence intent ──────────────────────────────────────────────────────

describe("converting a legacy dashboard has to be earned", () => {
  it("a no-change session preserves legacy storage", () => {
    const s = legacySession();
    expect(edit.saveIntent(s)).toBe("preserve-source");
    const payload = edit.buildSavePayload(s);
    expect(payload.ok && payload.widgets.every((w) => !("layout" in w))).toBe(true);
  });

  it("a title-only edit preserves legacy storage", () => {
    const s = edit.updateWidget(legacySession(), "a", { title: "Renamed" });
    expect(edit.saveIntent(s)).toBe("preserve-source");
    const payload = edit.buildSavePayload(s);
    expect(payload.ok && payload.widgets.some((w) => w.title === "Renamed")).toBe(true);
    expect(payload.ok && payload.widgets.every((w) => !("layout" in w))).toBe(true);
  });

  it("a config-only edit preserves legacy storage", () => {
    const s = edit.updateWidget(legacySession(), "a", {
      config: { source: "any", metric: "success_rate" },
    });
    expect(edit.saveIntent(s)).toBe("preserve-source");
    expect(edit.buildSavePayload(s).ok).toBe(true);
  });

  it("a drag that ends where it began does NOT convert the dashboard", () => {
    let s = legacySession();
    s = edit.commitLayout(s, [at("a", 2, 2), at("b", 1, 0, 2, 1), at("c", 3, 0)]);
    s = edit.commitLayout(s, [at("a", 0, 0), at("b", 1, 0, 2, 1), at("c", 3, 0)]);
    expect(edit.saveIntent(s)).toBe("preserve-source");
  });

  it("a real move converts, and writes a rectangle for EVERY widget", () => {
    const s = edit.commitLayout(legacySession(), [
      at("a", 0, 2),
      at("b", 1, 0, 2, 1),
      at("c", 3, 0),
    ]);
    expect(edit.saveIntent(s)).toBe("persist-explicit-layout");
    const payload = edit.buildSavePayload(s);
    expect(payload.ok).toBe(true);
    expect(payload.ok && payload.widgets.map((w) => w.layout)).toEqual([
      { x: 0, y: 2, w: 1, h: 1 },
      { x: 1, y: 0, w: 2, h: 1 },
      { x: 3, y: 0, w: 1, h: 1 },
    ]);
  });

  it("an already-explicit dashboard keeps writing explicitly, even untouched", () => {
    const s = explicitSession();
    expect(edit.isLayoutDirty(s)).toBe(false);
    expect(edit.saveIntent(s)).toBe("persist-explicit-layout");
    const payload = edit.buildSavePayload(s);
    expect(payload.ok && payload.widgets.map((w) => w.layout)).toEqual([
      { x: 3, y: 0, w: 1, h: 1 },
      { x: 0, y: 2, w: 2, h: 1 },
    ]);
  });

  it("never sends a partial layout", () => {
    const s = explicitSession();
    const broken: edit.LayoutEditState = { ...s, workingLayout: [s.workingLayout[0]!] };
    expect(edit.buildSavePayload(broken)).toMatchObject({
      ok: false,
      reason: "missing-placement",
    });
  });
});

// ── Add-widget bridge ───────────────────────────────────────────────────────

describe("adding a widget places it, atomically", () => {
  it("uses the first fitting gap rather than always appending", () => {
    // Row 0 has a single free cell at column 3.
    let s = edit.beginEdit(
      [widget("a"), widget("b"), widget("c"), widget("wide", "m")],
      [at("a", 0, 0), at("b", 1, 0), at("c", 2, 0), at("wide", 0, 1, 2, 1)],
      "legacy-derived",
    );
    const added = edit.addWidget(s, widget("new"));
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    s = added.state;
    expect(board(s.workingLayout)["new"]).toBe("3,0,1,1");
  });

  it("drops to the first row that fits when the gap is too narrow", () => {
    const s = edit.beginEdit(
      [widget("wide", "xl")],
      [at("wide", 0, 0, 3, 1)],
      "legacy-derived",
    );
    const added = edit.addWidget(s, widget("big", "m"));
    expect(added.ok && board(added.state.workingLayout)["big"]).toBe("0,1,2,1");
  });

  it("adds the widget and its rectangle together — never one without the other", () => {
    const added = edit.addWidget(legacySession(), widget("new"));
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.state.workingWidgets).toHaveLength(4);
    expect(added.state.workingLayout).toHaveLength(4);
    expect(added.state.workingLayout.some((p) => p.widgetId === "new")).toBe(true);
  });

  it("marks the board dirty, so adding converts a legacy dashboard", () => {
    const added = edit.addWidget(legacySession(), widget("new"));
    expect(added.ok && edit.saveIntent(added.state)).toBe("persist-explicit-layout");
  });

  it("removing takes the rectangle with it and leaves the gap", () => {
    const s = edit.removeWidget(legacySession(), "b");
    expect(s.workingWidgets.map((w) => w.id)).toEqual(["a", "c"]);
    expect(board(s.workingLayout)).toEqual({ a: "0,0,1,1", c: "3,0,1,1" });
  });
});

// ── Resize bridge ───────────────────────────────────────────────────────────

describe("resizing runs through the same engine as dragging", () => {
  it("updates the preset and the rectangle together", () => {
    const s = edit.beginEdit([widget("a")], [at("a", 0, 0)], "legacy-derived");
    const out = edit.applyWidgetSize(s, "a", "m");
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.state.workingWidgets[0]?.size).toBe("m");
    expect(board(out.state.workingLayout)["a"]).toBe("0,0,2,1");
  });

  it("pushes what the bigger footprint now covers downward", () => {
    const s = edit.beginEdit(
      [widget("a"), widget("b")],
      [at("a", 0, 0), at("b", 1, 0)],
      "legacy-derived",
    );
    const out = edit.applyWidgetSize(s, "a", "m");
    expect(out.ok && board(out.state.workingLayout)).toEqual({
      a: "0,0,2,1",
      b: "1,1,1,1",
    });
  });

  it("shrinking preserves the gap it opens", () => {
    const s = edit.beginEdit(
      [widget("a", "w"), widget("b")],
      [at("a", 0, 0, 4, 1), at("b", 0, 1)],
      "legacy-derived",
    );
    const out = edit.applyWidgetSize(s, "a", "s");
    expect(out.ok && board(out.state.workingLayout)).toEqual({
      a: "0,0,1,1",
      b: "0,1,1,1",
    });
  });

  it("refuses a preset that would cross the right edge, with an instruction", () => {
    const s = edit.beginEdit([widget("a")], [at("a", 3, 0)], "legacy-derived");
    const out = edit.applyWidgetSize(s, "a", "m");
    expect(out).toEqual({ ok: false, reason: "Move this widget left to use this size." });
  });

  it("leaves state untouched when a resize is refused", () => {
    const s = edit.beginEdit([widget("a")], [at("a", 3, 0)], "legacy-derived");
    edit.applyWidgetSize(s, "a", "m");
    expect(board(s.workingLayout)["a"]).toBe("3,0,1,1");
    expect(s.workingWidgets[0]?.size).toBe("s");
  });

  it("offers only the presets that fit at the widget's current column", () => {
    const layout = [at("edge", 3, 0), at("left", 0, 1)];
    const all: AnalyticsWidgetSize[] = ["s", "m", "l", "xl", "w", "tall"];
    expect([...edit.allowedSizesAt(layout, "edge", all)].sort()).toEqual(["s", "tall"]);
    expect([...edit.allowedSizesAt(layout, "left", all)].sort()).toEqual(
      ["l", "m", "s", "tall", "w", "xl"],
    );
  });
});

// ── Pointer → candidate rectangle ───────────────────────────────────────────

describe("the pointer picks a cell, not a card", () => {
  // 800px grid, 4 columns, 14px gaps → 189.5px tracks, 203.5px pitch.
  const metrics = gridMetricsFromWidth(800, 4);
  const base = {
    gridLeft: 100,
    gridTop: 50,
    grabDx: 20,
    grabDy: 10,
    footprint: { w: 1, h: 1 },
    metrics,
  };

  it("maps the grid origin to cell 0,0", () => {
    expect(candidateRectFor({ ...base, pointerX: 120, pointerY: 60 })).toEqual({
      x: 0,
      y: 0,
      w: 1,
      h: 1,
    });
  });

  it("snaps to the nearest column as the card's own top-left crosses half a track", () => {
    const justBefore = candidateRectFor({ ...base, pointerX: 120 + 101, pointerY: 60 });
    const justAfter = candidateRectFor({ ...base, pointerX: 120 + 103, pointerY: 60 });
    expect(justBefore.x).toBe(0);
    expect(justAfter.x).toBe(1);
  });

  it("reaches a row far below the board — a new row is a real destination", () => {
    const rect = candidateRectFor({ ...base, pointerY: 60 + 204 * 6, pointerX: 120 });
    expect(rect.y).toBe(6);
  });

  it("clamps a wide footprint so it stays on the grid, without changing its width", () => {
    const rect = candidateRectFor({
      ...base,
      footprint: { w: 3, h: 1 },
      pointerX: 120 + 204 * 3,
      pointerY: 60,
    });
    expect(rect).toEqual({ x: 1, y: 0, w: 3, h: 1 });
  });

  it("never produces a negative cell", () => {
    const rect = candidateRectFor({ ...base, pointerX: -500, pointerY: -500 });
    expect(rect.x).toBe(0);
    expect(rect.y).toBe(0);
  });

  it("keeps the grabbed point under the pointer, so the card lands where it looks", () => {
    // Grabbed 20px in; pointer at the centre of column 2 ⇒ the card's top-left
    // is 20px left of the pointer, which still rounds to column 2.
    const rect = candidateRectFor({
      ...base,
      pointerX: 100 + 2 * 203.5 + 20,
      pointerY: 50 + 204 + 10,
    });
    expect(rect).toEqual({ x: 2, y: 1, w: 1, h: 1 });
  });

  it("treats identical rectangles as the same destination", () => {
    expect(sameRect({ x: 1, y: 2, w: 2, h: 1 }, { x: 1, y: 2, w: 2, h: 1 })).toBe(true);
    expect(sameRect({ x: 1, y: 2, w: 2, h: 1 }, { x: 1, y: 3, w: 2, h: 1 })).toBe(false);
    expect(sameRect(null, null)).toBe(true);
  });
});
