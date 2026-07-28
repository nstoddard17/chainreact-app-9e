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
/**
 * Slow enough to read as "this widget moved over there" rather than a flicker.
 * The easing decelerates the whole way (no fast launch), which is what stops a
 * re-target during a drag from feeling like a snap.
 */
const REFLOW_MS = 320;
const REFLOW_EASING = "cubic-bezier(0.22, 0.61, 0.36, 1)";

export function useGridReflow(
  containerRef: RefObject<HTMLElement | null>,
  /** Changes whenever the rendered order changes (e.g. the joined widget ids). */
  orderKey: string,
  enabled: boolean,
): void {
  const previous = useRef<Map<string, DOMRect>>(new Map());
  const running = useRef<Map<string, Animation>>(new Map());

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) {
      previous.current = new Map();
      return;
    }

    const items = Array.from(container.children).filter(
      (c): c is HTMLElement => c instanceof HTMLElement && Boolean(c.dataset.widgetId),
    );

    // Cancel our in-flight flips BEFORE measuring. getBoundingClientRect()
    // reports the TRANSFORMED box, so measuring mid-animation would read a
    // widget's travelling position as if it were its layout position and
    // compute a nonsense delta for the next flip — which is what made a
    // re-target during a drag jump. Every measurement here is a settled layout.
    for (const animation of running.current.values()) animation.cancel();
    running.current.clear();

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
      const animation = item.animate(
        [
          { transform: `translate(${dx}px, ${dy}px)` },
          { transform: "translate(0px, 0px)" },
        ],
        { duration: REFLOW_MS, easing: REFLOW_EASING },
      );
      running.current.set(id, animation);
      animation.addEventListener("finish", () => {
        if (running.current.get(id) === animation) running.current.delete(id);
      });
    }
  }, [containerRef, orderKey, enabled]);
}
