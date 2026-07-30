"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Shared overlay-sheet behaviour for the builder's secondary surfaces
 * (BUILDER-RESPONSIVE-LAYOUT-1).
 *
 * The agent rail and the node-configuration surface both become full-height
 * sheets over the canvas at narrower widths. A sheet that floats over the
 * primary surface owes the keyboard three things — focus goes in, Tab stays in,
 * focus comes back out on close — and neither surface should implement those
 * three things its own way. So this hook owns them once, and both surfaces call
 * it with `active` set to whether they are CURRENTLY an open overlay.
 *
 * It is deliberately DOM-only: it moves focus and listens for keys. It never
 * decides whether a surface should be open, never touches the graph, the
 * conversation, or the config draft, and it holds no state a re-render could
 * lose. Panel mode passes `active: false` and the hook does nothing at all,
 * which is why an in-flow rail on a 1440px screen behaves exactly as it did
 * before this slice.
 */

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function focusableWithin(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter((element) => {
    // `offsetParent === null` catches display:none ancestors, which matters
    // because the rail keeps its collapsed payload mounted-but-hidden to
    // preserve the transcript — those controls must not be Tab targets.
    if (element.hidden) return false;
    if (element.getAttribute("aria-hidden") === "true") return false;
    return element.offsetParent !== null || element === document.activeElement;
  });
}

export function useBuilderOverlaySurface({
  active,
  containerRef,
  onEscape,
}: {
  /** True only while this surface is an OPEN OVERLAY (never in panel mode). */
  active: boolean;
  containerRef: RefObject<HTMLElement | null>;
  /**
   * Escape handler. Optional because a surface that already owns a
   * document-level Escape binding for BOTH presentations (the config drawer)
   * must not get a second one here.
   */
  onEscape?: (() => void) | undefined;
}): void {
  // Remembered across the open→close transition so focus can be handed back to
  // whatever the user was on when the sheet took over. A ref, not state: it must
  // survive re-renders without causing any.
  const restoreTo = useRef<HTMLElement | null>(null);

  // Focus in on open, back out on close. One concern, so one effect.
  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;
    const previous =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Don't record a target inside the sheet itself — that would make close
    // restore focus to a node that is about to be hidden.
    restoreTo.current = previous && !container.contains(previous) ? previous : null;

    const first = focusableWithin(container)[0];
    if (first) {
      first.focus();
    } else {
      // A sheet with nothing focusable yet (async payload) still needs to own
      // focus, or Tab would continue behind the scrim.
      container.setAttribute("tabindex", "-1");
      container.focus();
    }

    return () => {
      const target = restoreTo.current;
      restoreTo.current = null;
      // Only restore if focus is still inside the closing sheet; if the user has
      // already clicked elsewhere, yanking focus back would be the bug.
      const activeElement = document.activeElement;
      const focusStillInside =
        activeElement instanceof HTMLElement && container.contains(activeElement);
      const focusWasLost = activeElement === null || activeElement === document.body;
      if (target && (focusStillInside || focusWasLost) && target.isConnected) {
        target.focus();
      }
    };
  }, [active, containerRef]);

  // Tab containment + Escape. Bound on the document so it fires wherever focus
  // currently is, including a nested field inside the sheet.
  useEffect(() => {
    if (!active) return;
    function handler(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      const container = containerRef.current;
      if (!container) return;

      if (event.key === "Escape") {
        if (!onEscape) return;
        event.preventDefault();
        onEscape();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = focusableWithin(container);
      if (focusable.length === 0) {
        // Nothing to move to — keep focus on the sheet rather than letting it
        // escape to the canvas behind the scrim.
        event.preventDefault();
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const current = document.activeElement;

      if (!(current instanceof HTMLElement) || !container.contains(current)) {
        // Focus drifted outside (a click on the scrim, a programmatic blur):
        // pull it back to the edge the user is Tabbing toward.
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }
      if (event.shiftKey && current === first) {
        event.preventDefault();
        last.focus();
        return;
      }
      if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [active, containerRef, onEscape]);
}
