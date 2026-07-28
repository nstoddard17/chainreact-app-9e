"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";

/**
 * FLIP reflow for the dashboard grid (CD-DRAG-1).
 *
 * CSS grid re-places items instantly when their DOM order changes, so a
 * drag-reorder preview would otherwise teleport: the layout is correct but the
 * user can't see WHICH widgets moved or where they went. This measures every
 * grid child before and after the order changes and plays the difference as a
 * short transform animation, so the untouched widgets visibly slide aside to
 * make room for the one being dragged.
 *
 * Presentation only — it never changes layout state, so a browser without the
 * Web Animations API (or a user who prefers reduced motion) simply gets the
 * instant reflow, which is still correct.
 */
export function useGridReflow(
  containerRef: RefObject<HTMLElement | null>,
  /** Changes whenever the rendered order changes (e.g. the joined widget ids). */
  orderKey: string,
  enabled: boolean,
): void {
  const previous = useRef<Map<string, DOMRect>>(new Map());

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) {
      previous.current = new Map();
      return;
    }

    const items = Array.from(container.children).filter(
      (c): c is HTMLElement => c instanceof HTMLElement && Boolean(c.dataset.widgetId),
    );
    const next = new Map<string, DOMRect>();
    for (const item of items) {
      next.set(item.dataset.widgetId as string, item.getBoundingClientRect());
    }

    const before = previous.current;
    previous.current = next;

    // First measurement seeds the baseline; there is nothing to animate from.
    if (!enabled || before.size === 0) return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    for (const item of items) {
      const id = item.dataset.widgetId as string;
      const from = before.get(id);
      const to = next.get(id);
      // A widget that was just added has no prior position to travel from.
      if (!from || !to) continue;
      const dx = from.left - to.left;
      const dy = from.top - to.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      if (typeof item.animate !== "function") continue;
      item.animate(
        [
          { transform: `translate(${dx}px, ${dy}px)` },
          { transform: "translate(0px, 0px)" },
        ],
        { duration: 180, easing: "cubic-bezier(0.2, 0, 0, 1)" },
      );
    }
  }, [containerRef, orderKey, enabled]);
}
