/** @jest-environment node */
import { DEFAULT_OVERVIEW_WIDGETS } from "@/contracts/analyticsDefaults";
import {
  ANALYTICS_CANONICAL_COLUMNS,
  footprintForSize,
  type AnalyticsWidget,
} from "@/contracts/analytics";
import {
  migrateLegacyOrderedLayout,
  normalizeDashboardWidgets,
  projectLayoutToColumns,
  validateLayout,
  type AnalyticsColumnCount,
  type AnalyticsLayout,
} from "@/core/analytics/layout";

/**
 * The default Overview board's contract
 * (ANALYTICS-DEFAULT-OVERVIEW-WELCOME-FIRST-1).
 *
 * ONE SOURCE OF TRUTH. `contracts/analyticsDefaults.ts` is the only default
 * definition: the server seeds a new account's first board from it and the
 * client's "Restore default layout" rewrites to it. It is stored in LEGACY form
 * (no `layout` field), so array order plus `size` is the whole positional
 * signal — which is why "welcome first" is expressed as array position and
 * verified through the real engine here rather than by hand-authored
 * coordinates.
 */

const WELCOME_ID = "ov-note";

/** The order the product intends, pinned so a reorder has to be deliberate. */
const EXPECTED_ORDER = [
  "ov-note",
  "ov-runs",
  "ov-success",
  "ov-active",
  "ov-duration",
  "ov-overtime",
  "ov-outcome",
  "ov-top",
  "ov-heatmap",
  "ov-apps",
  "ov-recent",
] as const;

/** Every non-welcome default, in the relative order it has always had. */
const NON_WELCOME_ORDER = EXPECTED_ORDER.filter((id) => id !== WELCOME_ID);

const legacyOf = (widgets: readonly AnalyticsWidget[]) =>
  widgets.map((w) => ({ id: w.id, size: w.size }));

function defaultLayout(): AnalyticsLayout {
  const result = migrateLegacyOrderedLayout(legacyOf(DEFAULT_OVERVIEW_WIDGETS), {
    columnCount: ANALYTICS_CANONICAL_COLUMNS,
  });
  if (!result.ok) throw new Error(`default board did not migrate: ${result.reason}`);
  return result.layout;
}

/** Canonical reading order: top-to-bottom, then left-to-right. */
const readingOrder = (layout: AnalyticsLayout) =>
  [...layout].sort((a, b) => a.y - b.y || a.x - b.x).map((p) => p.widgetId);

// ── the inventory ────────────────────────────────────────────────────────────

describe("the canonical default inventory", () => {
  it("leads with the welcome widget", () => {
    expect(DEFAULT_OVERVIEW_WIDGETS[0]?.id).toBe(WELCOME_ID);
    expect(DEFAULT_OVERVIEW_WIDGETS[0]?.title).toBe("Welcome to your dashboard");
  });

  it("keeps the welcome widget's existing type and size", () => {
    const welcome = DEFAULT_OVERVIEW_WIDGETS[0]!;
    expect(welcome.type).toBe("note");
    expect(welcome.size).toBe("m");
    expect(footprintForSize(welcome.size)).toEqual({ w: 2, h: 1 });
  });

  it("does not change the welcome widget's copy or configuration", () => {
    // This batch moves the widget; it does not rewrite it.
    const welcome = DEFAULT_OVERVIEW_WIDGETS[0]!;
    expect(welcome.icon).toBe("Sparkle");
    expect(welcome.config.source).toBe("any");
    expect(welcome.config.note).toMatch(/^This is your account's analytics\./);
    expect(welcome.config.metric).toBeUndefined();
  });

  it("holds every default widget exactly once, with unique ids", () => {
    const ids = DEFAULT_OVERVIEW_WIDGETS.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...EXPECTED_ORDER].sort());
  });

  it("keeps the default widget count unchanged", () => {
    expect(DEFAULT_OVERVIEW_WIDGETS).toHaveLength(11);
  });

  it("preserves the relative order of every non-welcome widget", () => {
    const others = DEFAULT_OVERVIEW_WIDGETS.map((w) => w.id).filter((id) => id !== WELCOME_ID);
    expect(others).toEqual([...NON_WELCOME_ORDER]);
  });

  it("preserves every widget's size preset", () => {
    expect(DEFAULT_OVERVIEW_WIDGETS.map((w) => `${w.id}:${w.size}`)).toEqual([
      "ov-note:m",
      "ov-runs:s",
      "ov-success:s",
      "ov-active:s",
      "ov-duration:s",
      "ov-overtime:xl",
      "ov-outcome:s",
      "ov-top:m",
      "ov-heatmap:l",
      "ov-apps:m",
      "ov-recent:m",
    ]);
  });

  it("is stored in LEGACY form — array order is the placement signal", () => {
    // If a future batch starts writing explicit placement into the default, this
    // fails and forces the two representations to be reconciled deliberately
    // rather than drifting apart.
    for (const widget of DEFAULT_OVERVIEW_WIDGETS) {
      expect("layout" in widget).toBe(false);
    }
  });
});

// ── four-column placement ────────────────────────────────────────────────────

describe("the default board at four columns", () => {
  it("puts the welcome widget at x: 0, y: 0", () => {
    const welcome = defaultLayout().find((p) => p.widgetId === WELCOME_ID)!;
    expect({ x: welcome.x, y: welcome.y }).toEqual({ x: 0, y: 0 });
  });

  it("gives the welcome widget its full 2×1 footprint", () => {
    const welcome = defaultLayout().find((p) => p.widgetId === WELCOME_ID)!;
    expect({ w: welcome.w, h: welcome.h }).toEqual({ w: 2, h: 1 });
    expect(welcome.x + welcome.w).toBeLessThanOrEqual(ANALYTICS_CANONICAL_COLUMNS);
  });

  it("puts nothing above or to the left of it", () => {
    const layout = defaultLayout();
    const welcome = layout.find((p) => p.widgetId === WELCOME_ID)!;
    const precede = layout
      .filter((p) => p.widgetId !== WELCOME_ID)
      .filter((p) => p.y + p.h <= welcome.y || p.x + p.w <= welcome.x)
      .map((p) => p.widgetId);
    expect(precede).toEqual([]);
  });

  it("overlaps nothing with it", () => {
    const layout = defaultLayout();
    const welcome = layout.find((p) => p.widgetId === WELCOME_ID)!;
    const overlapping = layout
      .filter((p) => p.widgetId !== WELCOME_ID)
      .filter(
        (p) =>
          p.x < welcome.x + welcome.w &&
          p.x + p.w > welcome.x &&
          p.y < welcome.y + welcome.h &&
          p.y + p.h > welcome.y,
      )
      .map((p) => p.widgetId);
    expect(overlapping).toEqual([]);
  });

  it("validates as a complete board, with a placement for every widget", () => {
    const layout = defaultLayout();
    expect(validateLayout(layout, ANALYTICS_CANONICAL_COLUMNS)).toEqual({ ok: true });
    expect(layout).toHaveLength(DEFAULT_OVERVIEW_WIDGETS.length);
    for (const widget of DEFAULT_OVERVIEW_WIDGETS) {
      const placed = layout.find((p) => p.widgetId === widget.id);
      expect(placed).toBeDefined();
      expect({ w: placed!.w, h: placed!.h }).toEqual(footprintForSize(widget.size));
    }
  });

  it("leads the canonical reading order", () => {
    expect(readingOrder(defaultLayout())[0]).toBe(WELCOME_ID);
  });

  it("is deterministic — repeated derivation produces identical geometry", () => {
    const first = defaultLayout();
    for (let i = 0; i < 3; i += 1) expect(defaultLayout()).toEqual(first);
  });

  it("is independent of the viewport, so creation cannot vary by device", () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, "innerWidth");
    try {
      const baseline = defaultLayout();
      for (const width of [320, 768, 1440, 2560]) {
        Object.defineProperty(globalThis, "innerWidth", { value: width, configurable: true });
        expect(defaultLayout()).toEqual(baseline);
      }
    } finally {
      if (original) Object.defineProperty(globalThis, "innerWidth", original);
    }
  });

  it("produces no partial layout — the whole board or nothing", () => {
    const normalized = normalizeDashboardWidgets(DEFAULT_OVERVIEW_WIDGETS);
    expect(normalized.layoutSource).toBe("legacy-derived");
    expect(normalized.layoutProblems ?? []).toEqual([]);
    expect(normalized.effectiveLayout).toHaveLength(DEFAULT_OVERVIEW_WIDGETS.length);
  });
});

// ── responsive projections ───────────────────────────────────────────────────

describe("the welcome widget leads every projection", () => {
  const project = (columns: AnalyticsColumnCount): AnalyticsLayout => {
    if (columns === ANALYTICS_CANONICAL_COLUMNS) return defaultLayout();
    const result = projectLayoutToColumns(defaultLayout(), columns);
    if (!result.ok) throw new Error(`projection to ${columns} failed: ${result.reason}`);
    return result.layout;
  };

  it.each([4, 3, 2, 1] as const)("is first at %i columns", (columns) => {
    const layout = project(columns);
    expect(readingOrder(layout)[0]).toBe(WELCOME_ID);
    const welcome = layout.find((p) => p.widgetId === WELCOME_ID)!;
    expect({ x: welcome.x, y: welcome.y }).toEqual({ x: 0, y: 0 });
  });

  it.each([3, 2, 1] as const)("keeps every widget and stays valid at %i columns", (columns) => {
    const layout = project(columns);
    expect(layout).toHaveLength(DEFAULT_OVERVIEW_WIDGETS.length);
    expect(validateLayout(layout, columns)).toEqual({ ok: true });
    for (const placed of layout) expect(placed.x + placed.w).toBeLessThanOrEqual(columns);
  });

  it("clamps the welcome widget to the single available column at one column", () => {
    const welcome = project(1).find((p) => p.widgetId === WELCOME_ID)!;
    expect(welcome).toEqual({ widgetId: WELCOME_ID, x: 0, y: 0, w: 1, h: 1 });
  });

  it("never persists a projection — the canonical board is unchanged by projecting", () => {
    const canonical = defaultLayout();
    for (const columns of [3, 2, 1] as const) project(columns);
    expect(defaultLayout()).toEqual(canonical);
  });
});

// ── existing dashboards are not touched ──────────────────────────────────────

describe("existing dashboards keep their own arrangement", () => {
  /** A board stored in legacy form with the welcome note LAST — the old default. */
  const storedLegacyOldDefault: readonly AnalyticsWidget[] = [
    ...DEFAULT_OVERVIEW_WIDGETS.filter((w) => w.id !== WELCOME_ID),
    DEFAULT_OVERVIEW_WIDGETS.find((w) => w.id === WELCOME_ID)!,
  ];

  it("does not reorder a legacy board that still has the welcome note last", () => {
    const result = normalizeDashboardWidgets(storedLegacyOldDefault);
    expect(result.widgets.map((w) => w.id)).toEqual(storedLegacyOldDefault.map((w) => w.id));
    // Derived from ITS OWN order, so the note stays where that order puts it.
    const welcome = result.effectiveLayout.find((p) => p.widgetId === WELCOME_ID)!;
    expect({ x: welcome.x, y: welcome.y }).toEqual({ x: 2, y: 4 });
    expect(readingOrder(result.effectiveLayout)[0]).toBe("ov-runs");
  });

  it("does not move a welcome widget a user placed explicitly", () => {
    const customized: readonly AnalyticsWidget[] = [
      { ...DEFAULT_OVERVIEW_WIDGETS[0]!, layout: { x: 2, y: 3, w: 2, h: 1 } },
      { ...DEFAULT_OVERVIEW_WIDGETS[1]!, layout: { x: 0, y: 0, w: 1, h: 1 } },
    ];
    const result = normalizeDashboardWidgets(customized);
    expect(result.layoutSource).toBe("persisted");
    expect(result.effectiveLayout).toEqual([
      { widgetId: WELCOME_ID, x: 2, y: 3, w: 2, h: 1 },
      { widgetId: "ov-runs", x: 0, y: 0, w: 1, h: 1 },
    ]);
  });

  it("does not treat a board named Overview as a default to rewrite", () => {
    // Normalization is given widgets, not a name — there is no code path by which
    // a title could trigger the new default. This pins that: a one-widget board
    // normalizes to itself, whatever the dashboard is called.
    const sparse: readonly AnalyticsWidget[] = [DEFAULT_OVERVIEW_WIDGETS[3]!];
    const result = normalizeDashboardWidgets(sparse);
    expect(result.widgets.map((w) => w.id)).toEqual(["ov-active"]);
    expect(result.effectiveLayout).toHaveLength(1);
  });

  it("never writes placement while reading, for either order", () => {
    for (const board of [DEFAULT_OVERVIEW_WIDGETS, storedLegacyOldDefault]) {
      const before = JSON.parse(JSON.stringify(board)) as unknown;
      const result = normalizeDashboardWidgets(board);
      expect(result.widgets.every((w) => !("layout" in w))).toBe(true);
      // …and the input objects were not mutated either.
      expect(JSON.parse(JSON.stringify(board))).toEqual(before);
    }
  });
});
