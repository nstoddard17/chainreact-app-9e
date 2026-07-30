"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { ANALYTICS_CANONICAL_COLUMNS } from "@/contracts/analytics";
import {
  columnsForContainerWidth,
  projectLayoutToColumns,
  type AnalyticsColumnCount,
  type AnalyticsLayout,
} from "@/core/analytics/layout";

/**
 * The responsive controller (ANALYTICS-EXPLICIT-LAYOUT-S5-RESPONSIVE-PROJECTION-1).
 *
 * Owns exactly three things: how wide the grid container actually is, how many
 * columns that width can show, and the derived projection to draw. It owns NO
 * dashboard state — not saved widgets, not the working layout, not persistence
 * intent, not collision, not pointer capture. A viewport change must never be
 * able to reach any of those, which is easiest to guarantee if it cannot see
 * them.
 *
 * IT MEASURES THE CONTAINER, NOT THE WINDOW. The grid sits inside a page with a
 * sidebar and padding, so `window.innerWidth` answers a different question than
 * the one that matters. `ResizeObserver` watches the element itself; there is no
 * global resize listener.
 *
 * THE EDIT LOCK. While an edit session is open the grid stays canonical, whatever
 * the container is doing. Re-projecting mid-session would move the board under
 * the user's pointer, and the coordinates they are editing are canonical ones —
 * a narrow projection is not something you can drag in and convert back. So a
 * narrowing window gets horizontal scroll, not a different layout.
 *
 * FIRST PAINT. `measured` starts false and the column count starts CANONICAL, so
 * the server and the first client render agree (no hydration mismatch) and no
 * widget is ever drawn at an invalid coordinate. The observer fires
 * synchronously on observe, so the real count is in place before paint in
 * practice. Starting at 1 column instead would briefly show a phone layout on a
 * desktop, which reads as broken; starting canonical is at worst a brief
 * too-wide board on a phone.
 */

export interface AnalyticsResponsiveGridState {
  /** False until the container has reported a width. */
  readonly measured: boolean;
  /** What the container can show right now. */
  readonly viewColumnCount: AnalyticsColumnCount;
  /** What the grid will actually draw (canonical while editing). */
  readonly renderColumnCount: AnalyticsColumnCount;
  /** Whether the layout can be edited at this width. */
  readonly layoutEditingAvailable: boolean;
  /** True when an edit session is holding the grid at four columns. */
  readonly isCanonicalEditLocked: boolean;
}

export function useResponsiveGrid({
  containerRef,
  editing,
}: {
  containerRef: RefObject<HTMLElement | null>;
  /** An edit session is open; the grid must stay canonical. */
  editing: boolean;
}): AnalyticsResponsiveGridState {
  const [width, setWidth] = useState<number | null>(null);
  // Latch the observer so a resize during an edit session cannot be mistaken
  // for a user action; the value is simply read again when editing ends.
  const editingRef = useRef(editing);
  editingRef.current = editing;

  useEffect(() => {
    const element = containerRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const next = entry.contentRect.width;
      setWidth((previous) => (previous === next ? previous : next));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [containerRef]);

  const viewColumnCount =
    width === null ? ANALYTICS_CANONICAL_COLUMNS : columnsForContainerWidth(width);
  const layoutEditingAvailable = viewColumnCount === ANALYTICS_CANONICAL_COLUMNS;

  return {
    measured: width !== null,
    viewColumnCount,
    // The lock: an open session pins the grid to canonical.
    renderColumnCount: editing ? ANALYTICS_CANONICAL_COLUMNS : viewColumnCount,
    layoutEditingAvailable,
    isCanonicalEditLocked: editing && !layoutEditingAvailable,
  };
}

/**
 * The projection to draw, or `null` when the grid is canonical (in which case
 * the caller passes nothing and the renderer uses the canonical layout by
 * reference — no needless object churn, no remounts).
 *
 * A projection that cannot be computed degrades to canonical rendering rather
 * than to an error: a too-wide board is readable, an empty one is not.
 */
export function useProjectedLayout(
  canonicalLayout: AnalyticsLayout,
  renderColumnCount: AnalyticsColumnCount,
): AnalyticsLayout | null {
  return useMemo(() => {
    if (renderColumnCount === ANALYTICS_CANONICAL_COLUMNS) return null;
    const projected = projectLayoutToColumns(canonicalLayout, renderColumnCount);
    return projected.ok ? projected.layout : null;
  }, [canonicalLayout, renderColumnCount]);
}
