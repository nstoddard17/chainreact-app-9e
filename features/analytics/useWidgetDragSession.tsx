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
import type { AnalyticsWidget } from "@/contracts/analytics";
import { AnalyticsIcon } from "@/components/analytics/icons";
import { computeDragPreview, hitTestSlot, type DragSlot } from "./dashboardHelpers";

/**
 * COORDINATE-SPACE CONTRACT (ANALYTICS-DRAG-COORDINATE-SPACE-REPAIR-1).
 *
 * There are exactly two spaces in this file and they are never mixed:
 *
 *   VIEWPORT — `event.clientX/clientY`, `getBoundingClientRect()`. The ONLY
 *     space used to position the fixed overlay. The overlay's position has one
 *     formula and one only: `pointer − grabOffset`, where `grabOffset` is the
 *     pointer's position inside the dragged card captured at pointer-down from
 *     that card's OWN rect. Nothing else is ever added — not scroll, not the
 *     grid's origin, not the card's starting coordinates.
 *
 *   GRID-LOCAL — `clientX − gridRect.left`, `clientY − gridRect.top`, and the
 *     frozen slot boxes. The ONLY space used for destination hit-testing.
 *
 * The bug this contract exists to prevent: slot boxes were built from
 * `offsetLeft/offsetTop` (relative to the OFFSETPARENT, which was the document
 * body, not the grid) and then compared against grid-local pointer coordinates,
 * while the overlay was placed at `gridRect + offsetLeft` — double-counting the
 * grid's own position. The ghost sat hundreds of pixels down and right of the
 * cursor, and no pointer position could ever fall inside a slot. The grid now
 * sets `position: relative` so it IS the offsetParent, and the slot capture
 * asserts that before trusting offset*.
 *
 * CAPTURE OWNERSHIP (ANALYTICS-DRAG-RIGHTWARD-CAPTURE-LOSS-1).
 *
 * Pointer capture is taken on the GRID, never on the grip that started the
 * drag. Measured in Chromium, capturing on the grip made the drag directional:
 *
 *   dragging LEFT   — reconciliation moves the SIBLING, the dragged card's node
 *                     stays put, capture survives, the drag works.
 *   dragging RIGHT  — reconciliation moves the DRAGGED card's own node, which
 *                     relocates the capturing button with it. Chromium then
 *                     fires `lostpointercapture`, the session cancels, and the
 *                     preview snaps back — mid-gesture, with the button still
 *                     held down.
 *
 * The observed rightward sequence was: pointerdown → gotpointercapture(grip) →
 * order=[bravo,alpha,…] → lostpointercapture(grip) → order=[alpha,bravo,…].
 * The grip was still `isConnected` throughout: the node was MOVED, not
 * destroyed, and a move is enough for Chromium to drop capture.
 *
 * The grid never reorders, never remounts and keeps its identity for the whole
 * edit session, so it is a safe owner. `lostpointercapture` remains a real
 * cancellation signal — it is simply no longer fired by ordinary reordering.
 *
 * Pointer-driven widget drag session (ANALYTICS-WIDGET-DRAG-STABILITY-1).
 *
 * The previous drag models re-ordered on whichever widget the pointer happened
 * to be over — a feedback loop, because every re-order moves cards (and their
 * rectangles) under the pointer, which then re-targets on whatever arrives.
 * Thresholds only muffled it. This model removes moving geometry from the
 * interaction entirely:
 *
 * - At drag start, the committed order and every card's slot box are captured
 *   ONCE. Those slots are the collision targets for the whole session; the
 *   cards may animate, but the animation cannot redefine where the slots are.
 *   Slot boxes come from offset* geometry, which ignores the transforms a
 *   running FLIP animation applies.
 * - The held card floats as a fixed-position overlay following the pointer
 *   (moved via direct style mutation, coalesced through rAF — no per-frame
 *   React renders). The in-flow card stays mounted as the blue destination
 *   placeholder, so the layout always answers "where will this land".
 * - The preview is always `computeDragPreview(startOrder, draggedId, slot)` —
 *   derived, never mutated — so every slot keeps one stable meaning and the
 *   origin stays reachable. State updates only when the slot actually changes;
 *   a still pointer is inert, and gutters keep the current destination.
 * - The session is bounded by pointer capture on the GRID plus explicit
 *   exits: pointerup commits exactly the preview; pointercancel,
 *   lostpointercapture, Escape, window blur, unmount, and leaving edit mode
 *   all cancel. Events from any other pointer id are ignored, so ordinary
 *   hover can never move a widget.
 */

export interface DragOverlayState {
  readonly widget: AnalyticsWidget;
  readonly width: number;
  readonly height: number;
}

interface ActiveSession {
  readonly pointerId: number;
  readonly draggedId: string;
  readonly startOrder: readonly AnalyticsWidget[];
  readonly slots: readonly DragSlot[];
  readonly originSlot: number;
  readonly grabDx: number;
  readonly grabDy: number;
  /**
   * The element holding pointer capture — ALWAYS the grid, never the grip.
   * See the capture-ownership note above.
   */
  readonly captureOwner: HTMLElement;
  readonly removeListeners: () => void;
  /** The only mutable field: the current destination slot. */
  destination: number;
}

export function useWidgetDragSession({
  gridRef,
  widgets,
  enabled,
  onCommit,
}: {
  gridRef: RefObject<HTMLDivElement | null>;
  /** The COMMITTED order — captured as the session's start order at drag start. */
  widgets: readonly AnalyticsWidget[];
  enabled: boolean;
  onCommit: (order: readonly AnalyticsWidget[]) => void;
}) {
  const sessionRef = useRef<ActiveSession | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [previewOrder, setPreviewOrder] = useState<readonly AnalyticsWidget[] | null>(null);
  const [overlay, setOverlay] = useState<DragOverlayState | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const posRef = useRef<{ x: number; y: number } | null>(null);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const framePendingRef = useRef(false);
  const frameRef = useRef<number | null>(null);

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
    // ORDER MATTERS: the session is already cleared and the listeners already
    // detached before capture is released. Releasing capture itself fires
    // `lostpointercapture`, and that event must never be able to run the
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
    setPreviewOrder(null);
    setOverlay(null);
  }, []);

  const cancelDrag = useCallback(() => teardown(), [teardown]);

  const commitDrag = useCallback(() => {
    const s = sessionRef.current;
    if (!s) return;
    const next =
      s.destination === s.originSlot
        ? null // Landed where it started — nothing to write.
        : computeDragPreview(s.startOrder, s.draggedId, s.destination);
    teardown();
    if (next) onCommitRef.current(next);
  }, [teardown]);

  const startDrag = useCallback(
    (widgetId: string, e: ReactPointerEvent<HTMLElement>) => {
      if (!enabledRef.current || sessionRef.current) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const grid = gridRef.current;
      if (!grid) return;

      const cards = Array.from(grid.children).filter(
        (c): c is HTMLElement => c instanceof HTMLElement && Boolean(c.dataset.widgetId),
      );
      const startOrder = widgetsRef.current;
      const originSlot = cards.findIndex((c) => c.dataset.widgetId === widgetId);
      const widget = startOrder.find((w) => w.id === widgetId);
      if (originSlot < 0 || !widget || cards.length !== startOrder.length) return;

      const gridRect = grid.getBoundingClientRect();

      // Frozen collision geometry, in GRID-LOCAL coordinates (see the
      // coordinate-space contract above).
      //
      // offset* is preferred because it is layout position: a FLIP transform
      // still running from a previous drop cannot leak into it the way
      // getBoundingClientRect() would. But offset* is relative to the
      // OFFSETPARENT, which is grid-local only because the grid sets
      // `position: relative` for exactly this purpose. If some future ancestor
      // ever takes that role, fall back to rect arithmetic rather than let the
      // two spaces silently diverge again — that divergence was this bug.
      const slots: DragSlot[] = cards.map((c) => {
        if (c.offsetParent === grid) {
          return {
            left: c.offsetLeft,
            top: c.offsetTop,
            width: c.offsetWidth,
            height: c.offsetHeight,
          };
        }
        const r = c.getBoundingClientRect();
        return {
          left: r.left - gridRect.left,
          top: r.top - gridRect.top,
          width: r.width,
          height: r.height,
        };
      });

      // Overlay geometry is VIEWPORT space, taken from the dragged card's own
      // rect. Never gridRect + offset*: that mixes spaces and double-counts the
      // grid's position within its offsetParent.
      const cardRect = cards[originSlot]!.getBoundingClientRect();
      // Where inside the card the user grabbed it. Subtracted exactly once,
      // every frame, to place the overlay.
      const grabDx = e.clientX - cardRect.left;
      const grabDy = e.clientY - cardRect.top;

      // Stop text selection / native drag from the grip, then hand the pointer
      // to the GRID. The grip's only jobs are identifying the widget and
      // starting the session; it must not own the pointer, because
      // reconciliation can move it (see the capture-ownership note above).
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
          const gridEl = gridRef.current;
          if (!live || !point || !gridEl) return;
          // Overlay follows the pointer via style mutation — zero React state.
          posRef.current = { x: point.x - live.grabDx, y: point.y - live.grabDy };
          const el = overlayRef.current;
          if (el) {
            el.style.transform = `translate3d(${posRef.current.x}px, ${posRef.current.y}px, 0)`;
          }
          const rect = gridEl.getBoundingClientRect();
          const slot = hitTestSlot(live.slots, point.x - rect.left, point.y - rect.top);
          // Null (gutter/outside) keeps the destination; same slot changes
          // nothing — React state moves ONLY when the destination slot does.
          if (slot === null || slot === live.destination) return;
          live.destination = slot;
          const preview = computeDragPreview(live.startOrder, live.draggedId, slot);
          if (preview) setPreviewOrder(preview);
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
        // `lostpointercapture` BUBBLES, so a stale event from a descendant (the
        // grip that used to hold capture, say) would otherwise cancel a healthy
        // drag. Only the owner losing the pointer is a real cancellation.
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

      sessionRef.current = {
        pointerId: e.pointerId,
        draggedId: widgetId,
        startOrder,
        slots,
        originSlot,
        grabDx,
        grabDy,
        captureOwner: grid,
        removeListeners,
        destination: originSlot,
      };
      // The single overlay-position formula: pointer − grabOffset. At rest that
      // is exactly the card's current top-left, so the ghost appears under the
      // cursor with no jump.
      posRef.current = { x: e.clientX - grabDx, y: e.clientY - grabDy };
      document.body.style.userSelect = "none";
      document.body.style.cursor = "grabbing";
      setDraggingId(widgetId);
      setPreviewOrder(startOrder);
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

  return { draggingId, previewOrder, overlay, overlayRef, startDrag };
}

/**
 * The floating card that follows the pointer. Deliberately a lightweight ghost
 * (chrome + title, muted body): re-mounting a live widget body here would
 * re-run its data fetching mid-drag. No transition — surrounding cards animate,
 * the held card tracks the pointer exactly.
 */
export function DragOverlayGhost({
  overlay,
  overlayRef,
}: {
  overlay: DragOverlayState;
  overlayRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      ref={overlayRef}
      data-testid="analytics-drag-overlay"
      aria-hidden="true"
      className="pointer-events-none fixed left-0 top-0 z-50 flex flex-col overflow-hidden rounded-xl border border-primary bg-card opacity-90 shadow-2xl"
      style={{ width: overlay.width, height: overlay.height }}
    >
      <div className="flex items-center gap-2 border-b border-border px-3.5 py-2.5">
        {overlay.widget.icon && (
          <span className="text-primary">
            <AnalyticsIcon name={overlay.widget.icon} size={12} />
          </span>
        )}
        <span className="truncate text-sm font-semibold text-foreground">
          {overlay.widget.title}
        </span>
      </div>
      <div className="flex-1 bg-muted/40" />
    </div>
  );
}
