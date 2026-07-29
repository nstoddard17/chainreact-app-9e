"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { ANALYTICS_CANONICAL_COLUMNS, type AnalyticsWidget } from "@/contracts/analytics";
import { placeWidget, type AnalyticsLayout, type GridRect } from "@/core/analytics/layout";
import { candidateRectFor, gridMetricsFromWidth, sameRect } from "./candidateRect";

/**
 * Explicit-layout drag session
 * (ANALYTICS-EXPLICIT-LAYOUT-S4-EDITOR-INTEGRATION-1).
 *
 * WHAT CHANGED FROM THE ORDERED SESSION. Only the destination model. The
 * destination used to be an index into an array of widget cards, which is why a
 * visibly empty cell could never be a target. It is now a candidate RECTANGLE
 * derived from the pointer and the grid's frozen geometry, resolved through the
 * layout engine. Every valid cell is reachable, including holes and rows that do
 * not exist yet.
 *
 * WHAT DELIBERATELY DID NOT CHANGE — every hard-won pointer fix is preserved
 * verbatim, because each one was a real production defect:
 *
 *   - Capture is taken on the GRID, never the grip. Capturing on the grip made
 *     the drag directional: a rightward move relocated the capturing button and
 *     Chromium dropped capture mid-gesture (ANALYTICS-DRAG-RIGHTWARD-CAPTURE-LOSS-1).
 *   - Geometry is frozen at drag start. A moving layout must never redefine the
 *     targets — that feedback loop is what no threshold could fix.
 *   - Two coordinate spaces, never mixed: the overlay is placed in VIEWPORT space
 *     by `pointer − grabOffset` and nothing else; the candidate is computed in
 *     GRID-LOCAL space (ANALYTICS-DRAG-COORDINATE-SPACE-REPAIR-1).
 *   - Pointer moves are coalesced through rAF and only touch React state when the
 *     candidate rectangle actually changes, so a still pointer is inert.
 *   - `lostpointercapture` only cancels when the GRID is the target; the event
 *     bubbles, so a stale one from a descendant must not kill a healthy drag.
 *
 * PREVIEW IS ALWAYS DERIVED FROM THE DRAG-START LAYOUT, never from the previous
 * preview. This is mandatory, not stylistic: the engine deliberately leaves
 * displaced widgets where it pushed them, so chaining previews would ratchet the
 * board downward as the pointer wandered. Recomputing from the snapshot is what
 * makes moving across several targets and coming back land exactly where it
 * started.
 */

export interface DragOverlayState {
  readonly widget: AnalyticsWidget;
  readonly width: number;
  readonly height: number;
}

interface ActiveSession {
  readonly pointerId: number;
  readonly draggedId: string;
  readonly startLayout: AnalyticsLayout;
  readonly startRect: GridRect;
  readonly gridLeft: number;
  readonly gridTop: number;
  readonly metrics: ReturnType<typeof gridMetricsFromWidth>;
  readonly footprint: { w: number; h: number };
  readonly grabDx: number;
  readonly grabDy: number;
  /** ALWAYS the grid — see the capture-ownership note above. */
  readonly captureOwner: HTMLElement;
  readonly removeListeners: () => void;
  /** The only mutable fields: the live candidate and its engine result. */
  candidate: GridRect;
  previewLayout: AnalyticsLayout;
}

export function useExplicitDragSession({
  gridRef,
  widgets,
  layout,
  enabled,
  onCommit,
}: {
  gridRef: RefObject<HTMLDivElement | null>;
  readonly widgets: readonly AnalyticsWidget[];
  /** The WORKING layout — snapshotted as the session's start layout. */
  readonly layout: AnalyticsLayout;
  readonly enabled: boolean;
  readonly onCommit: (next: AnalyticsLayout) => void;
}) {
  const sessionRef = useRef<ActiveSession | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [previewLayout, setPreviewLayout] = useState<AnalyticsLayout | null>(null);
  const [placeholder, setPlaceholder] = useState<GridRect | null>(null);
  const [overlay, setOverlay] = useState<DragOverlayState | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const posRef = useRef<{ x: number; y: number } | null>(null);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const framePendingRef = useRef(false);
  const frameRef = useRef<number | null>(null);

  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const widgetsRef = useRef(widgets);
  widgetsRef.current = widgets;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  const teardown = useCallback(() => {
    const s = sessionRef.current;
    if (!s) return;
    sessionRef.current = null;
    framePendingRef.current = false;
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    // ORDER MATTERS: clear the session and detach listeners BEFORE releasing
    // capture. Releasing fires `lostpointercapture`, and that must never run the
    // cancellation path over a drag that has just committed successfully.
    s.removeListeners();
    try {
      if (s.captureOwner.hasPointerCapture?.(s.pointerId)) {
        s.captureOwner.releasePointerCapture(s.pointerId);
      }
    } catch {
      // Already released (pointerup) or unsupported — fine either way.
    }
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
    posRef.current = null;
    lastPointRef.current = null;
    setDraggingId(null);
    setPreviewLayout(null);
    setPlaceholder(null);
    setOverlay(null);
  }, []);

  const cancelDrag = useCallback(() => teardown(), [teardown]);

  const commitDrag = useCallback(() => {
    const s = sessionRef.current;
    if (!s) return;
    // Landed exactly where it began ⇒ nothing to write, so a no-op drag can
    // never convert a legacy dashboard to explicit storage.
    const moved = !sameRect(s.candidate, s.startRect);
    const next = moved ? s.previewLayout : null;
    teardown();
    if (next) onCommitRef.current(next);
  }, [teardown]);

  const startDrag = useCallback(
    (widgetId: string, e: ReactPointerEvent<HTMLElement>) => {
      if (!enabledRef.current || sessionRef.current) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const grid = gridRef.current;
      if (!grid) return;

      const startLayout = layoutRef.current;
      const startRect = startLayout.find((p) => p.widgetId === widgetId);
      const widget = widgetsRef.current.find((w) => w.id === widgetId);
      if (!startRect || !widget) return;

      const card = grid.querySelector<HTMLElement>(`[data-widget-id="${CSS.escape(widgetId)}"]`);
      if (!card) return;

      const gridRect = grid.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      // VIEWPORT space, from the dragged card's own rect. Never gridRect +
      // offset*: that mixes spaces and double-counts the grid's position.
      const grabDx = e.clientX - cardRect.left;
      const grabDy = e.clientY - cardRect.top;

      e.preventDefault();
      try {
        grid.setPointerCapture(e.pointerId);
      } catch {
        // Unsupported environment — the explicit exit listeners still bound it.
      }

      const onPointerMove = (ev: PointerEvent) => {
        const s = sessionRef.current;
        if (!s || ev.pointerId !== s.pointerId) return;
        lastPointRef.current = { x: ev.clientX, y: ev.clientY };
        if (framePendingRef.current) return;
        framePendingRef.current = true;
        frameRef.current = requestAnimationFrame(() => {
          framePendingRef.current = false;
          frameRef.current = null;
          const live = sessionRef.current;
          const point = lastPointRef.current;
          if (!live || !point) return;

          // Overlay follows the pointer by style mutation — zero React renders.
          posRef.current = { x: point.x - live.grabDx, y: point.y - live.grabDy };
          const el = overlayRef.current;
          if (el) {
            el.style.transform = `translate3d(${posRef.current.x}px, ${posRef.current.y}px, 0)`;
          }

          const candidate = candidateRectFor({
            pointerX: point.x,
            pointerY: point.y,
            gridLeft: live.gridLeft,
            gridTop: live.gridTop,
            grabDx: live.grabDx,
            grabDy: live.grabDy,
            footprint: live.footprint,
            metrics: live.metrics,
          });
          // React state moves ONLY when the destination rectangle does.
          if (sameRect(candidate, live.candidate)) return;

          // ALWAYS from the drag-start snapshot — never from the last preview.
          const placed = placeWidget(live.startLayout, live.draggedId, candidate, {
            columnCount: ANALYTICS_CANONICAL_COLUMNS,
            collisionPolicy: "push-down",
          });
          if (!placed.ok) return; // Keep the last valid destination.
          live.candidate = candidate;
          live.previewLayout = placed.layout;
          setPlaceholder(candidate);
          setPreviewLayout(placed.layout);
        });
      };
      const onPointerUp = (ev: PointerEvent) => {
        const s = sessionRef.current;
        if (!s || ev.pointerId !== s.pointerId) return;
        commitDrag();
      };
      const onPointerCancel = (ev: PointerEvent) => {
        const s = sessionRef.current;
        if (!s || ev.pointerId !== s.pointerId) return;
        cancelDrag();
      };
      const onLostCapture = (ev: PointerEvent) => {
        const s = sessionRef.current;
        if (!s || ev.pointerId !== s.pointerId) return;
        // The event BUBBLES: only the owner losing the pointer is a real
        // cancellation, never a stale one from a descendant.
        if (ev.target !== s.captureOwner) return;
        cancelDrag();
      };
      const onKeyDown = (ev: KeyboardEvent) => {
        if (ev.key === "Escape") cancelDrag();
      };
      const onWindowBlur = () => cancelDrag();

      grid.addEventListener("pointermove", onPointerMove);
      grid.addEventListener("pointerup", onPointerUp);
      grid.addEventListener("pointercancel", onPointerCancel);
      grid.addEventListener("lostpointercapture", onLostCapture);
      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("blur", onWindowBlur);
      const removeListeners = () => {
        grid.removeEventListener("pointermove", onPointerMove);
        grid.removeEventListener("pointerup", onPointerUp);
        grid.removeEventListener("pointercancel", onPointerCancel);
        grid.removeEventListener("lostpointercapture", onLostCapture);
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("blur", onWindowBlur);
      };

      const footprint = { w: startRect.w, h: startRect.h };
      sessionRef.current = {
        pointerId: e.pointerId,
        draggedId: widgetId,
        startLayout,
        startRect: { x: startRect.x, y: startRect.y, w: startRect.w, h: startRect.h },
        gridLeft: gridRect.left,
        gridTop: gridRect.top,
        metrics: gridMetricsFromWidth(gridRect.width, ANALYTICS_CANONICAL_COLUMNS),
        footprint,
        grabDx,
        grabDy,
        captureOwner: grid,
        removeListeners,
        candidate: { x: startRect.x, y: startRect.y, w: startRect.w, h: startRect.h },
        previewLayout: startLayout,
      };
      // pointer − grabOffset. At rest that IS the card's top-left, so the ghost
      // appears under the cursor with no jump.
      posRef.current = { x: e.clientX - grabDx, y: e.clientY - grabDy };
      document.body.style.userSelect = "none";
      document.body.style.cursor = "grabbing";
      setDraggingId(widgetId);
      setPreviewLayout(startLayout);
      setPlaceholder({ x: startRect.x, y: startRect.y, w: startRect.w, h: startRect.h });
      setOverlay({ widget, width: cardRect.width, height: cardRect.height });
    },
    [gridRef, commitDrag, cancelDrag],
  );

  // Leaving edit mode mid-drag cancels rather than stranding a session.
  useEffect(() => {
    if (!enabled) cancelDrag();
  }, [enabled, cancelDrag]);

  // Unmount is a session exit like any other.
  useEffect(() => () => cancelDrag(), [cancelDrag]);

  // A React re-render rewrites the overlay's style prop; re-apply the latest
  // pointer-driven transform so a destination change can't snap the ghost back.
  useLayoutEffect(() => {
    const el = overlayRef.current;
    const p = posRef.current;
    if (el && p) el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
  });

  return { draggingId, previewLayout, placeholder, overlay, overlayRef, startDrag };
}
