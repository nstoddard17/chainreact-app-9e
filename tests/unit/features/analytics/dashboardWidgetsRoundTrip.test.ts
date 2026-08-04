/** @jest-environment node */
/**
 * core/analytics/layout — persisted-board ROUND TRIP.
 *
 * TEST-REDUNDANCY-CONSOLIDATION-2A — merged from the sibling
 * normalizeDashboardWidgets.test.ts and serializeDashboardWidgets.test.ts.
 * Both exercise the SAME production module (@/core/analytics/layout) from the
 * two directions of one transformation: normalize = stored -> rendered,
 * serialize = rendered -> stored. Neither mocks anything, both are node-env
 * pure-function suites, so the merge is a straight process saving with every
 * case kept verbatim under its own section.
 *
 * The four dashboardLayout* suites were audited alongside these and
 * deliberately NOT merged — they exercise materially different production
 * paths (contracts schema, service+repository round trip, API write-boundary
 * board check, and model/defaults diagnostics), which the batch rules
 * explicitly exclude from merging.
 */

import { normalizeDashboardWidgets } from "@/core/analytics/layout";
import { DEFAULT_OVERVIEW_WIDGETS } from "@/contracts/analyticsDefaults";
import type { AnalyticsWidgetSize } from "@/contracts/analytics";
import { serializeDashboardWidgets } from "@/core/analytics/layout";
import { AnalyticsWidgetSchema, type AnalyticsWidget } from "@/contracts/analytics";

// ---------------------------------------------------------------------------
// Merged verbatim from the former normalizeDashboardWidgets.test.ts
// ---------------------------------------------------------------------------
describe("normalizeDashboardWidgets", () => {

  /**
   * ANALYTICS-EXPLICIT-LAYOUT-S2-CONTRACT-1 — the read chokepoint.
   *
   * The guarantees under test: persisted data and effective layout stay separate;
   * a read never converts a legacy board; a broken board is repaired rather than
   * emptied; and no widget disappears because a new field was malformed.
   */

  const stored = (id: string, size: AnalyticsWidgetSize = "s", layout?: unknown) => ({
    id,
    type: "stat",
    size,
    title: id,
    config: { source: "any", metric: "runs" },
    ...(layout === undefined ? {} : { layout }),
  });

  const codesOf = (result: ReturnType<typeof normalizeDashboardWidgets>) =>
    result.layoutProblems.map((p) => p.code);

  // ── Case A: legacy boards ───────────────────────────────────────────────────

  describe("a board stored before explicit placement is derived, never converted", () => {
    const legacy = [stored("a"), stored("b", "m"), stored("c")];

    it("derives a four-column effective layout from order and size", () => {
      const result = normalizeDashboardWidgets(legacy);
      expect(result.layoutSource).toBe("legacy-derived");
      expect(result.effectiveLayout).toEqual([
        { widgetId: "a", x: 0, y: 0, w: 1, h: 1 },
        { widgetId: "b", x: 1, y: 0, w: 2, h: 1 },
        { widgetId: "c", x: 3, y: 0, w: 1, h: 1 },
      ]);
      expect(result.layoutProblems).toEqual([]);
    });

    it("keeps every legacy widget and attaches no layout to any of them", () => {
      const result = normalizeDashboardWidgets(legacy);
      expect(result.widgets).toHaveLength(3);
      for (const widget of result.widgets) {
        expect(widget.layout).toBeUndefined();
        expect("layout" in widget).toBe(false);
      }
    });

    it("does not mutate the stored widget objects it was handed", () => {
      const snapshot = JSON.parse(JSON.stringify(legacy)) as unknown;
      normalizeDashboardWidgets(legacy);
      expect(JSON.parse(JSON.stringify(legacy))).toEqual(snapshot);
    });

    it("normalizes the shipped default board to the pinned canonical rectangles", () => {
      const result = normalizeDashboardWidgets(DEFAULT_OVERVIEW_WIDGETS);
      expect(result.layoutSource).toBe("legacy-derived");
      // Welcome-first (ANALYTICS-DEFAULT-OVERVIEW-WELCOME-FIRST-1): the note leads
      // the default array, so first-fit gives it the top-left rectangle.
      expect(result.effectiveLayout).toEqual([
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

    it("derives the default board WITHOUT writing placement into the widgets", () => {
      // The reordered default is still stored in legacy form; reading it derives
      // rectangles in memory and must not add `layout` to any widget.
      const result = normalizeDashboardWidgets(DEFAULT_OVERVIEW_WIDGETS);
      expect(result.layoutSource).toBe("legacy-derived");
      expect(result.widgets.every((w) => !("layout" in w))).toBe(true);
      expect(result.widgets.map((w) => w.id)).toEqual(DEFAULT_OVERVIEW_WIDGETS.map((w) => w.id));
    });

    it("produces the same result whatever the viewport reports", () => {
      const original = Object.getOwnPropertyDescriptor(globalThis, "innerWidth");
      try {
        const baseline = normalizeDashboardWidgets(DEFAULT_OVERVIEW_WIDGETS);
        for (const width of [320, 1024, 2560]) {
          Object.defineProperty(globalThis, "innerWidth", { value: width, configurable: true });
          expect(normalizeDashboardWidgets(DEFAULT_OVERVIEW_WIDGETS)).toEqual(baseline);
        }
      } finally {
        if (original) Object.defineProperty(globalThis, "innerWidth", original);
      }
    });

    it("produces the same result when normalized repeatedly", () => {
      const once = normalizeDashboardWidgets(legacy);
      expect(normalizeDashboardWidgets(legacy)).toEqual(once);
    });

    it("treats an empty board as legacy with nothing to place", () => {
      const result = normalizeDashboardWidgets([]);
      expect(result).toEqual({
        widgets: [],
        effectiveLayout: [],
        layoutSource: "legacy-derived",
        layoutProblems: [],
      });
    });
  });

  // ── Case B: fully explicit boards ───────────────────────────────────────────

  describe("a board with explicit placement is used exactly as stored", () => {
    const explicit = [
      stored("a", "s", { x: 3, y: 0, w: 1, h: 1 }),
      stored("b", "m", { x: 0, y: 2, w: 2, h: 1 }),
    ];

    it("preserves the exact coordinates and reports them as persisted", () => {
      const result = normalizeDashboardWidgets(explicit);
      expect(result.layoutSource).toBe("persisted");
      expect(result.effectiveLayout).toEqual([
        { widgetId: "a", x: 3, y: 0, w: 1, h: 1 },
        { widgetId: "b", x: 0, y: 2, w: 2, h: 1 },
      ]);
      expect(result.layoutProblems).toEqual([]);
    });

    it("preserves deliberate gaps — nothing is compacted toward the top-left", () => {
      // Columns 0-2 of row 0 and all of row 1 are empty by the author's choice.
      const result = normalizeDashboardWidgets(explicit);
      expect(result.effectiveLayout.map((p) => `${p.x},${p.y}`)).toEqual(["3,0", "0,2"]);
    });

    it("keeps the stored layout on the widgets it returns", () => {
      const result = normalizeDashboardWidgets(explicit);
      expect(result.widgets.map((w) => w.layout)).toEqual([
        { x: 3, y: 0, w: 1, h: 1 },
        { x: 0, y: 2, w: 2, h: 1 },
      ]);
    });
  });

  // ── Case C: partial placement ───────────────────────────────────────────────

  describe("a half-placed board is repaired, never half-trusted", () => {
    const partial = [stored("a", "s", { x: 3, y: 0, w: 1, h: 1 }), stored("b", "m")];

    it("refuses to combine explicit coordinates with ordered auto-flow", () => {
      const result = normalizeDashboardWidgets(partial);
      expect(result.layoutSource).toBe("repaired-fallback");
      expect(codesOf(result)).toContain("partial-layout");
    });

    it("preserves every widget and rebuilds the whole board deterministically", () => {
      const result = normalizeDashboardWidgets(partial);
      expect(result.widgets.map((w) => w.id)).toEqual(["a", "b"]);
      expect(result.effectiveLayout).toEqual([
        { widgetId: "a", x: 0, y: 0, w: 1, h: 1 },
        { widgetId: "b", x: 1, y: 0, w: 2, h: 1 },
      ]);
    });

    it("names the widgets that were missing placement", () => {
      const result = normalizeDashboardWidgets(partial);
      const found = result.layoutProblems.find((p) => p.code === "partial-layout");
      expect(found?.widgetIds).toEqual(["b"]);
    });

    it("leaves the stored widgets untouched — the repair is in memory only", () => {
      const snapshot = JSON.parse(JSON.stringify(partial)) as unknown;
      normalizeDashboardWidgets(partial);
      expect(JSON.parse(JSON.stringify(partial))).toEqual(snapshot);
    });
  });

  // ── Case D: fully placed but invalid ────────────────────────────────────────

  describe("an invalid explicit board is repaired without losing a single widget", () => {
    it.each([
      [
        "overlapping widgets",
        [stored("a", "m", { x: 0, y: 0, w: 2, h: 1 }), stored("b", "m", { x: 1, y: 0, w: 2, h: 1 })],
        "overlap",
      ],
      [
        "a negative coordinate",
        [stored("a", "s", { x: 0, y: -1, w: 1, h: 1 }), stored("b", "s", { x: 1, y: 0, w: 1, h: 1 })],
        "invalid-layout-field",
      ],
      [
        "a rectangle past the right edge",
        [stored("a", "m", { x: 3, y: 0, w: 2, h: 1 }), stored("b", "s", { x: 0, y: 0, w: 1, h: 1 })],
        "invalid-layout-field",
      ],
      [
        "dimensions that contradict the size preset",
        [stored("a", "s", { x: 0, y: 0, w: 2, h: 1 }), stored("b", "s", { x: 2, y: 0, w: 1, h: 1 })],
        "size-layout-mismatch",
      ],
    ])("recovers from %s", (_name, board, expectedCode) => {
      const result = normalizeDashboardWidgets(board);
      expect(result.widgets).toHaveLength(2);
      expect(result.layoutSource).toBe("repaired-fallback");
      expect(codesOf(result)).toContain(expectedCode);
      // A complete, deterministic board comes back — never a half-placed one.
      expect(result.effectiveLayout).toHaveLength(2);
    });

    it("does not mutate the invalid stored input", () => {
      const board = [
        stored("a", "m", { x: 0, y: 0, w: 2, h: 1 }),
        stored("b", "m", { x: 1, y: 0, w: 2, h: 1 }),
      ];
      const snapshot = JSON.parse(JSON.stringify(board)) as unknown;
      normalizeDashboardWidgets(board);
      expect(JSON.parse(JSON.stringify(board))).toEqual(snapshot);
    });

    it("still returns every widget when ids repeat and no layout can be derived", () => {
      const board = [
        stored("dup", "s", { x: 0, y: 0, w: 1, h: 1 }),
        stored("dup", "s", { x: 1, y: 0, w: 1, h: 1 }),
      ];
      const result = normalizeDashboardWidgets(board);
      expect(result.widgets).toHaveLength(2);
      expect(codesOf(result)).toEqual(
        expect.arrayContaining(["duplicate-id", "layout-unrecoverable"]),
      );
      expect(result.effectiveLayout).toEqual([]);
    });
  });

  // ── No silent widget loss ───────────────────────────────────────────────────

  describe("a malformed layout field can never make a widget disappear", () => {
    it("keeps the widget and discards only its broken placement", () => {
      const board = [stored("keeper", "s", { x: "nope" }), stored("other")];
      const result = normalizeDashboardWidgets(board);
      expect(result.widgets.map((w) => w.id)).toEqual(["keeper", "other"]);
      expect(result.widgets[0]?.layout).toBeUndefined();
      expect(codesOf(result)).toContain("invalid-layout-field");
      expect(result.layoutSource).toBe("repaired-fallback");
    });

    it("survives a board where EVERY widget's placement is malformed", () => {
      // This is the rollback scenario: a parser that does not understand the
      // field must not empty the page.
      const board = [stored("a", "s", { bogus: 1 }), stored("b", "s", { bogus: 2 })];
      const result = normalizeDashboardWidgets(board);
      expect(result.widgets.map((w) => w.id)).toEqual(["a", "b"]);
      expect(result.effectiveLayout).toHaveLength(2);
      expect(result.layoutSource).toBe("repaired-fallback");
    });

    it("reports a widget that is unreadable for reasons unrelated to layout", () => {
      // Pre-existing CD-3A behaviour: it is still dropped, but no longer silently.
      const board = [stored("good"), { id: "broken", type: "not-a-type" }];
      const result = normalizeDashboardWidgets(board);
      expect(result.widgets.map((w) => w.id)).toEqual(["good"]);
      const found = result.layoutProblems.find((p) => p.code === "unparseable-widget");
      expect(found?.widgetIds).toEqual(["broken"]);
    });

    it("never puts stored user content into a problem message", () => {
      const board = [
        { ...stored("secretive"), title: "Q3 acquisition targets", config: { source: "any", note: "confidential" } },
        { id: "broken", type: "not-a-type", title: "Also confidential" },
      ];
      const result = normalizeDashboardWidgets(board);
      const text = JSON.stringify(result.layoutProblems);
      expect(text).not.toContain("acquisition");
      expect(text).not.toContain("confidential");
      expect(text).not.toContain("Also confidential");
    });

    it("degrades a non-array blob to an empty board rather than throwing", () => {
      const result = normalizeDashboardWidgets({ not: "an array" });
      expect(result.widgets).toEqual([]);
      expect(codesOf(result)).toEqual(["unreadable-widgets"]);
    });

    it("loads the contract's maximum and reports the tail it could not take", () => {
      const many = Array.from({ length: 50 }, (_, i) => stored(`w-${i}`));
      const result = normalizeDashboardWidgets(many);
      expect(result.widgets).toHaveLength(48);
      expect(codesOf(result)).toContain("widget-cap-exceeded");
    });
  });

});

// ---------------------------------------------------------------------------
// Merged verbatim from the former serializeDashboardWidgets.test.ts
// ---------------------------------------------------------------------------
describe("serializeDashboardWidgets", () => {

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

});
