import {
  ANALYTICS_CANONICAL_COLUMNS,
  AnalyticsWidgetLayoutSchema,
  AnalyticsWidgetSchema,
  footprintForSize,
  type AnalyticsWidget,
} from "@/contracts/analytics";
import { migrateLegacyOrderedLayout } from "./legacyMigration";
import { validateLayout } from "./validateLayout";
import type { AnalyticsLayout, LayoutProblemCode, PlacedWidget } from "./types";

/**
 * The read chokepoint's normalization (ANALYTICS-EXPLICIT-LAYOUT-S2-CONTRACT-1).
 *
 * PERSISTED DATA AND EFFECTIVE LAYOUT ARE DIFFERENT THINGS, and this module is
 * where they are told apart. A board stored before explicit placement carries
 * only an array order plus a `size` preset; it still needs canonical rectangles
 * to render from. Deriving those rectangles IN MEMORY is not the same as
 * writing them, and this function never writes: it takes the stored JSONB and
 * returns the widgets exactly as stored plus a separate effective layout, a
 * source label saying where that layout came from, and typed problems.
 *
 * NO EAGER WRITE-ON-READ. Reading a legacy dashboard must not convert it. That
 * matters for rollback: until a compatibility release that understands `layout`
 * is verified in production, no row should start carrying the field. See the
 * rollout sequence in the S2 outcome document.
 *
 * NO SILENT WIDGET LOSS. The previous read path parsed each widget with a
 * strict schema and DROPPED the ones that failed — so shipping a new optional
 * field was a rollback trap: a parser that did not know `layout` would make
 * every widget vanish while the page still rendered "successfully". Here, a
 * widget whose ONLY problem is its layout is preserved with the layout
 * discarded, and the whole board falls back to derived placement. A widget is
 * only ever dropped for a pre-existing, layout-unrelated corruption, and even
 * then it is reported rather than silently disappearing.
 *
 * Pure: no DOM, no viewport, no CSS, no clock, no I/O. The same stored board
 * normalizes identically on every device.
 */

export type AnalyticsLayoutProblemCode =
  /** Board-level findings from the engine's own validator. */
  | LayoutProblemCode
  /** The stored `widgets` value was not an array at all. */
  | "unreadable-widgets"
  /** More widgets stored than the contract's cap; the tail was not loaded. */
  | "widget-cap-exceeded"
  /** A widget failed to parse for reasons unrelated to layout; not loaded. */
  | "unparseable-widget"
  /** A widget's `layout` was malformed; the widget was kept without it. */
  | "invalid-layout-field"
  /** A widget's stored `layout` dimensions contradicted its `size` preset. */
  | "size-layout-mismatch"
  /** Some widgets carry placement and some do not — never a valid board. */
  | "partial-layout"
  /** Even the deterministic fallback could not be derived. */
  | "layout-unrecoverable";

export interface AnalyticsLayoutProblem {
  readonly code: AnalyticsLayoutProblemCode;
  /** Widget ids only — never titles, configs, or any stored user content. */
  readonly widgetIds: readonly string[];
  /** Developer-facing. Safe to log: carries no user configuration. */
  readonly message: string;
}

/**
 * Where the effective layout came from.
 *
 * - `persisted` — every widget carried valid explicit placement; used verbatim.
 * - `legacy-derived` — no widget carried placement; derived from order + size.
 * - `repaired-fallback` — placement existed but the board was not usable;
 *   derived from order + size and NOT written back.
 */
export type AnalyticsLayoutSource = "persisted" | "legacy-derived" | "repaired-fallback";

export interface NormalizedDashboardWidgets {
  /** The widgets as stored. Legacy widgets do NOT gain a `layout` here. */
  readonly widgets: readonly AnalyticsWidget[];
  /** Canonical rectangles for rendering. Never persisted by a read. */
  readonly effectiveLayout: AnalyticsLayout;
  readonly layoutSource: AnalyticsLayoutSource;
  readonly layoutProblems: readonly AnalyticsLayoutProblem[];
}

/** Mirrors `AnalyticsWidgetsSchema`'s cap; kept in step with the contract. */
const MAX_WIDGETS = 48;

function problem(
  code: AnalyticsLayoutProblemCode,
  widgetIds: readonly string[],
  message: string,
): AnalyticsLayoutProblem {
  return { code, widgetIds, message };
}

/** A best-effort id for a record that did not parse — for reporting only. */
function readIdHint(raw: unknown): string {
  const id = (raw as { id?: unknown } | null)?.id;
  return typeof id === "string" && id.length > 0 && id.length <= 64 ? id : "(unidentified)";
}

function hasLayoutKey(raw: unknown): boolean {
  return typeof raw === "object" && raw !== null && "layout" in raw;
}

function withoutLayout(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null) return raw;
  const { layout: _dropped, ...rest } = raw as Record<string, unknown>;
  return rest;
}

/**
 * Did the stored rectangle contradict the stored preset SPECIFICALLY?
 *
 * Only true when the rectangle is otherwise a perfectly good rectangle — a
 * structurally broken `layout` (missing keys, a string where a number belongs)
 * is a different fault and gets its own code. Reporting every broken layout as
 * a "size mismatch" would send whoever reads the diagnostic looking at the
 * resize presets for a problem that is not there.
 */
function isFootprintMismatch(raw: unknown, widget: AnalyticsWidget): boolean {
  const layout = (raw as { layout?: unknown }).layout;
  const parsed = AnalyticsWidgetLayoutSchema.safeParse(layout);
  if (!parsed.success) return false;
  const expected = footprintForSize(widget.size);
  return parsed.data.w !== expected.w || parsed.data.h !== expected.h;
}

export function normalizeDashboardWidgets(
  storedWidgets: unknown,
  options: { readonly columnCount?: number } = {},
): NormalizedDashboardWidgets {
  const columnCount = options.columnCount ?? ANALYTICS_CANONICAL_COLUMNS;
  const problems: AnalyticsLayoutProblem[] = [];

  if (!Array.isArray(storedWidgets)) {
    return {
      widgets: [],
      effectiveLayout: [],
      layoutSource: "legacy-derived",
      layoutProblems: [
        problem("unreadable-widgets", [], "The stored widget list was not an array."),
      ],
    };
  }

  // ── Stage 1: parse, preserving any widget whose only fault is its layout ──

  const raw = storedWidgets.slice(0, MAX_WIDGETS);
  if (storedWidgets.length > MAX_WIDGETS) {
    problems.push(
      problem(
        "widget-cap-exceeded",
        [],
        `Stored board holds ${storedWidgets.length} widgets; only the first ${MAX_WIDGETS} were loaded.`,
      ),
    );
  }

  const widgets: AnalyticsWidget[] = [];
  let layoutDiscardedAtParse = false;

  for (const record of raw) {
    const full = AnalyticsWidgetSchema.safeParse(record);
    if (full.success) {
      widgets.push(full.data);
      continue;
    }
    // The widget did not parse. If it carries a `layout`, try again WITHOUT it
    // before giving up — a bad new field must never cost the widget itself.
    if (hasLayoutKey(record)) {
      const stripped = AnalyticsWidgetSchema.safeParse(withoutLayout(record));
      if (stripped.success) {
        widgets.push(stripped.data);
        layoutDiscardedAtParse = true;
        problems.push(
          isFootprintMismatch(record, stripped.data)
            ? problem(
                "size-layout-mismatch",
                [stripped.data.id],
                `Stored placement contradicted the "${stripped.data.size}" size preset; placement ignored.`,
              )
            : problem(
                "invalid-layout-field",
                [stripped.data.id],
                "Stored placement was malformed; the widget was kept without it.",
              ),
        );
        continue;
      }
    }
    problems.push(
      problem(
        "unparseable-widget",
        [readIdHint(record)],
        "A stored widget could not be read and was not loaded.",
      ),
    );
  }

  // ── Stage 2: classify the board and produce the effective layout ─────────

  const deriveFallback = (
    source: AnalyticsLayoutSource,
  ): NormalizedDashboardWidgets => {
    const duplicates = duplicateIdsIn(widgets);
    if (duplicates.length > 0) {
      problems.push(
        problem("duplicate-id", duplicates, "The stored board repeats a widget id."),
      );
    }
    const derived = migrateLegacyOrderedLayout(
      widgets.map((w) => ({ id: w.id, size: w.size })),
      { columnCount },
    );
    if (!derived.ok) {
      problems.push(
        problem(
          "layout-unrecoverable",
          [],
          `No canonical layout could be derived (${derived.reason}).`,
        ),
      );
      return {
        widgets,
        effectiveLayout: [],
        layoutSource: source,
        layoutProblems: problems,
      };
    }
    return {
      widgets,
      effectiveLayout: derived.layout,
      layoutSource: source,
      layoutProblems: problems,
    };
  };

  if (widgets.length === 0) {
    return {
      widgets,
      effectiveLayout: [],
      layoutSource: layoutDiscardedAtParse ? "repaired-fallback" : "legacy-derived",
      layoutProblems: problems,
    };
  }

  const placed = widgets.filter((w) => w.layout);

  // Case A — a legacy board. Derive, never write.
  if (placed.length === 0) {
    return deriveFallback(layoutDiscardedAtParse ? "repaired-fallback" : "legacy-derived");
  }

  // Case C — a mixture. Explicit coordinates and ordered auto-flow must never
  // be combined: half a board would be authored and half guessed.
  if (placed.length < widgets.length) {
    problems.push(
      problem(
        "partial-layout",
        widgets.filter((w) => !w.layout).map((w) => w.id),
        `${placed.length} of ${widgets.length} widgets carry explicit placement; the board was rebuilt from order and size.`,
      ),
    );
    return deriveFallback("repaired-fallback");
  }

  // Case B / D — a fully explicit board. Trust it only if the WHOLE board is
  // valid; a single overlap makes the arrangement meaningless, not partly good.
  const board: PlacedWidget[] = widgets.map((w) => ({
    widgetId: w.id,
    x: w.layout!.x,
    y: w.layout!.y,
    w: w.layout!.w,
    h: w.layout!.h,
  }));
  const validation = validateLayout(board, columnCount);
  if (validation.ok) {
    return {
      widgets,
      effectiveLayout: board,
      layoutSource: "persisted",
      layoutProblems: problems,
    };
  }
  for (const found of validation.problems) {
    problems.push(problem(found.code, found.widgetIds, found.message));
  }
  return deriveFallback("repaired-fallback");
}

function duplicateIdsIn(widgets: readonly AnalyticsWidget[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const widget of widgets) {
    if (seen.has(widget.id)) duplicates.add(widget.id);
    seen.add(widget.id);
  }
  return [...duplicates];
}
