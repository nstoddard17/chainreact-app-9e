import {
  ANALYTICS_CANONICAL_COLUMNS,
  footprintForSize,
  type AnalyticsWidget,
  type AnalyticsWidgetConfig,
  type AnalyticsWidgetSize,
} from "@/contracts/analytics";
import {
  findFirstAvailableRect,
  resizeWidgetToFootprint,
  serializeDashboardWidgets,
  type AnalyticsLayout,
  type AnalyticsLayoutSource,
  type LayoutPersistenceIntent,
  type PlacedWidget,
  type SerializeResult,
} from "@/core/analytics/layout";

/**
 * The Analytics edit session's state, as pure data
 * (ANALYTICS-EXPLICIT-LAYOUT-S4-EDITOR-INTEGRATION-1).
 *
 * Every rule that decides WHAT the editor does lives here, as functions over a
 * plain object, so it can be tested without React, without a DOM and without a
 * server. The component holds one `useState` of this shape and calls these; the
 * pointer hook only decides WHERE the pointer is. Arithmetic stays in
 * `core/analytics/layout` — nothing here re-implements placement.
 *
 * SAVED vs WORKING is the spine. `saved*` is the last state the server
 * confirmed; `working*` is what the user is editing. Cancel restores saved; a
 * failed save leaves working untouched so nothing is silently lost.
 *
 * CONVERSION IS EARNED, NOT ASSUMED. A legacy dashboard has an effective layout
 * in memory from the moment it loads — that is not a reason to start persisting
 * coordinates. `layoutDirty` is computed by COMPARING working rectangles with
 * saved ones, so moving a widget away and putting it back leaves the board
 * legacy, and a title-only edit never converts it. Crossing that line is a
 * one-way door while a rollback below the compatibility release is still
 * possible.
 */

export interface LayoutEditState {
  readonly savedWidgets: readonly AnalyticsWidget[];
  readonly savedLayout: AnalyticsLayout;
  readonly workingWidgets: readonly AnalyticsWidget[];
  readonly workingLayout: AnalyticsLayout;
  readonly layoutSource: AnalyticsLayoutSource;
}

export type EditResult =
  | { readonly ok: true; readonly state: LayoutEditState }
  | { readonly ok: false; readonly reason: string };

const COLUMNS = ANALYTICS_CANONICAL_COLUMNS;

/** Enter edit mode: working starts as an exact copy of saved. */
export function beginEdit(
  savedWidgets: readonly AnalyticsWidget[],
  savedLayout: AnalyticsLayout,
  layoutSource: AnalyticsLayoutSource,
): LayoutEditState {
  return {
    savedWidgets,
    savedLayout,
    workingWidgets: savedWidgets.map((w) => ({ ...w })),
    workingLayout: savedLayout.map((p) => ({ ...p })),
    layoutSource,
  };
}

/** Discard the session's edits. */
export function cancelEdit(state: LayoutEditState): LayoutEditState {
  return beginEdit(state.savedWidgets, state.savedLayout, state.layoutSource);
}

/** Adopt a server-confirmed save as the new saved state. */
export function afterSave(
  state: LayoutEditState,
  savedWidgets: readonly AnalyticsWidget[],
  savedLayout: AnalyticsLayout,
  layoutSource: AnalyticsLayoutSource,
): LayoutEditState {
  return beginEdit(savedWidgets, savedLayout, layoutSource);
}

/** Replace the working layout with an engine result (a committed drag). */
export function commitLayout(state: LayoutEditState, next: AnalyticsLayout): LayoutEditState {
  return { ...state, workingLayout: next };
}

// ── Widget mutations ────────────────────────────────────────────────────────

/**
 * Add a widget at the first rectangle its footprint fits, scanning top-to-bottom
 * then left-to-right. The widget and its placement are added TOGETHER — a widget
 * without a rectangle is the partial state the read path has to repair, and the
 * explicit renderer refuses to draw it at all.
 */
export function addWidget(state: LayoutEditState, widget: AnalyticsWidget): EditResult {
  const footprint = footprintForSize(widget.size);
  const rect = findFirstAvailableRect(state.workingLayout, footprint, COLUMNS);
  if (!rect) {
    return { ok: false, reason: "That widget is too wide for this dashboard." };
  }
  return {
    ok: true,
    state: {
      ...state,
      workingWidgets: [...state.workingWidgets, widget],
      workingLayout: [...state.workingLayout, { widgetId: widget.id, ...rect }],
    },
  };
}

/** Remove a widget and its rectangle together, leaving the gap it vacated. */
export function removeWidget(state: LayoutEditState, widgetId: string): LayoutEditState {
  return {
    ...state,
    workingWidgets: state.workingWidgets.filter((w) => w.id !== widgetId),
    workingLayout: state.workingLayout.filter((p) => p.widgetId !== widgetId),
  };
}

/** Insert an already-built widget (duplicate / save-as-insight) with placement. */
export function insertWidget(state: LayoutEditState, widget: AnalyticsWidget): EditResult {
  return addWidget(state, widget);
}

/** Title / config edits. CONTENT only — the layout is deliberately untouched. */
export function updateWidget(
  state: LayoutEditState,
  widgetId: string,
  patch: { readonly title?: string; readonly config?: AnalyticsWidgetConfig },
): LayoutEditState {
  return {
    ...state,
    workingWidgets: state.workingWidgets.map((w) =>
      w.id === widgetId ? { ...w, ...patch } : w,
    ),
  };
}

/**
 * Resize through the SAME engine a drag uses. `size` and the rectangle's
 * dimensions move together or not at all — two sources of truth for width is how
 * the old editor's preview and commit came to disagree.
 *
 * A footprint that would cross the right edge at the widget's current column is
 * REFUSED, never quietly slid left: relocating a widget the user only asked to
 * widen is the same broken promise.
 */
export function applyWidgetSize(
  state: LayoutEditState,
  widgetId: string,
  size: AnalyticsWidgetSize,
): EditResult {
  const widget = state.workingWidgets.find((w) => w.id === widgetId);
  if (!widget) return { ok: false, reason: "That widget is no longer on this dashboard." };

  const footprint = footprintForSize(size);
  const placed = resizeWidgetToFootprint(state.workingLayout, widgetId, footprint, {
    columnCount: COLUMNS,
    collisionPolicy: "push-down",
  });
  if (!placed.ok) {
    return {
      ok: false,
      reason:
        placed.reason === "exceeds-columns"
          ? "Move this widget left to use this size."
          : "That size can't be applied here.",
    };
  }
  return {
    ok: true,
    state: {
      ...state,
      workingWidgets: state.workingWidgets.map((w) =>
        w.id === widgetId ? { ...w, size } : w,
      ),
      workingLayout: placed.layout,
    },
  };
}

/**
 * Which size presets can be applied where the widget currently sits. The UI
 * disables the rest rather than letting a user pick something that will be
 * refused — with the reason spelled out.
 */
export function allowedSizesAt(
  layout: AnalyticsLayout,
  widgetId: string,
  sizes: readonly AnalyticsWidgetSize[],
): ReadonlySet<AnalyticsWidgetSize> {
  const current = layout.find((p) => p.widgetId === widgetId);
  const allowed = new Set<AnalyticsWidgetSize>();
  if (!current) return allowed;
  for (const size of sizes) {
    if (current.x + footprintForSize(size).w <= COLUMNS) allowed.add(size);
  }
  return allowed;
}

// ── Dirty state ─────────────────────────────────────────────────────────────

const rectKey = (p: PlacedWidget) => `${p.widgetId}:${p.x},${p.y},${p.w},${p.h}`;

/**
 * Has the ARRANGEMENT actually changed? Compared rectangle by rectangle against
 * the saved layout, not by array identity — so a drag that ends where it started,
 * or a move that is later fully undone, leaves the board exactly as it was and a
 * legacy dashboard stays legacy.
 */
export function isLayoutDirty(state: LayoutEditState): boolean {
  if (state.workingLayout.length !== state.savedLayout.length) return true;
  const saved = new Set(state.savedLayout.map(rectKey));
  return state.workingLayout.some((p) => !saved.has(rectKey(p)));
}

/** Has any widget's own content (title, size preset, config, membership) changed? */
export function isContentDirty(state: LayoutEditState): boolean {
  if (state.workingWidgets.length !== state.savedWidgets.length) return true;
  const saved = new Map(state.savedWidgets.map((w) => [w.id, w]));
  return state.workingWidgets.some((w) => {
    const before = saved.get(w.id);
    if (!before) return true;
    return (
      before.title !== w.title ||
      before.size !== w.size ||
      before.icon !== w.icon ||
      JSON.stringify(before.config) !== JSON.stringify(w.config)
    );
  });
}

// ── Persistence ─────────────────────────────────────────────────────────────

/**
 * `persist-explicit-layout` ONLY when the arrangement really changed, or when
 * the board already carries persisted coordinates that must be kept. Everything
 * else — including a legacy board whose effective layout merely exists in
 * memory — stays `preserve-source`.
 */
export function saveIntent(state: LayoutEditState): LayoutPersistenceIntent {
  if (state.layoutSource === "persisted") return "persist-explicit-layout";
  return isLayoutDirty(state) ? "persist-explicit-layout" : "preserve-source";
}

/**
 * The exact widget array to PATCH. Explicit saves carry a rectangle for every
 * widget and are validated as a whole board first; a partial or invalid board is
 * a typed refusal, never a silent repair of what the user just arranged.
 */
export function buildSavePayload(state: LayoutEditState): SerializeResult {
  return serializeDashboardWidgets(state.workingWidgets, saveIntent(state), {
    layout: state.workingLayout,
    columnCount: COLUMNS,
  });
}
