"use client";

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import {
  ANALYTICS_CHART_MIN_HEIGHT,
  ANALYTICS_CHART_MIN_WIDTH,
} from "@/core/analytics/chartSizing";

/**
 * The one measurement seam for Analytics charts
 * (ANALYTICS-RESPONSIVE-CHART-SURFACES-1).
 *
 * ONE HOOK, NOT ONE PER CHART. Before this there were two private copies of a
 * width-only `useMeasuredWidth` (in `InsightLineChart` and `InsightBarChart`)
 * and several charts with no measurement at all. Height was measured nowhere,
 * which is why a chart could be clipped vertically without anything noticing.
 * `useChartSize` is now the only place Analytics observes a chart box.
 *
 * IT MEASURES ITS OWN ELEMENT, NEVER THE WINDOW. A widget's body width is a
 * function of the dashboard projection, the sidebar, the card padding and the
 * widget's own footprint — `window.innerWidth` answers none of that. There is no
 * global resize listener anywhere in this file.
 *
 * WHY THE SURFACE IS ABSOLUTELY POSITIONED. `ResponsiveChartSurface` fills its
 * parent with `absolute inset-0`, so the element being observed is sized purely
 * by the parent and can never be influenced by what the chart draws inside it.
 * That is what makes a ResizeObserver feedback loop structurally impossible
 * rather than merely unlikely — the classic "chart grows the box that sized the
 * chart" oscillation cannot start. The parent therefore has to be `relative`
 * with a real height (`min-h-0 flex-1` in the widget shell).
 *
 * STABILITY. Sizes are rounded to whole pixels and an identical size is dropped
 * before it reaches React, so a sub-pixel reflow is not a re-render. Updates are
 * coalesced into one animation frame, which keeps a dragged resize smooth
 * without the visible lag a debounce would add.
 *
 * IT OWNS NO DASHBOARD STATE. No persistence, no save intent, no layout, no
 * network. A chart resize cannot reach any of those from here.
 */

export interface ChartSurfaceSize {
  /** Integer CSS pixels of the chart body. */
  readonly width: number;
  readonly height: number;
  /** False until the observer has reported a real, non-zero box. */
  readonly measured: boolean;
  /**
   * Whether the chart may animate right now. False for a beat after any size
   * change (so a dragged resize does not replay entry animations frame by
   * frame) and false permanently when the user prefers reduced motion.
   */
  readonly animate: boolean;
}

export interface UseChartSizeOptions {
  /**
   * Size used before the first measurement, and in environments with no
   * `ResizeObserver` (jsdom's stub never reports). It keeps SSR and the first
   * client paint agreeing on something drawable instead of blank.
   */
  readonly fallbackWidth?: number;
  readonly fallbackHeight?: number;
}

const DEFAULT_FALLBACK_WIDTH = 480;
const DEFAULT_FALLBACK_HEIGHT = 160;

/** How long after a size change animations stay suppressed. */
const SETTLE_MS = 180;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function useChartSize({
  fallbackWidth = DEFAULT_FALLBACK_WIDTH,
  fallbackHeight = DEFAULT_FALLBACK_HEIGHT,
}: UseChartSizeOptions = {}): [RefObject<HTMLDivElement | null>, ChartSurfaceSize] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState<{ width: number; height: number; measured: boolean }>({
    width: fallbackWidth,
    height: fallbackHeight,
    measured: false,
  });
  const [settled, setSettled] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(false);
  /** The last size actually committed, so an identical one costs no render. */
  const committed = useRef<{ width: number; height: number } | null>(null);

  useEffect(() => {
    setReduceMotion(prefersReducedMotion());
  }, []);

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;

    let frame: number | null = null;
    // Scheduling is tracked by its own flag rather than by the frame HANDLE: a
    // synchronous `requestAnimationFrame` runs the callback before the handle is
    // assigned, so clearing the handle inside the callback would be undone by
    // the assignment and every later resize would be dropped forever.
    let scheduled = false;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;
    let pending: { width: number; height: number } | null = null;

    const cancelFrame = () => {
      if (frame !== null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame);
      frame = null;
      scheduled = false;
    };

    const commit = () => {
      scheduled = false;
      frame = null;
      const next = pending;
      pending = null;
      if (!next) return;
      // Identical rounded dimensions are not a state change AT ALL — not the
      // box, and not the animation gate either. Checking against a ref rather
      // than inside the updater matters: `setSettled` would re-render on its
      // own, so a reflow storm would still become a render storm.
      const previous = committed.current;
      if (
        previous &&
        previous.width === next.width &&
        previous.height === next.height
      ) {
        return;
      }
      committed.current = next;
      setBox({ width: next.width, height: next.height, measured: true });
      setSettled(false);
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(() => setSettled(true), SETTLE_MS);
    };

    const observer = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (!entry) return;
      const width = Math.round(entry.contentRect.width);
      const height = Math.round(entry.contentRect.height);
      // A 0×0 box is a collapsed or not-yet-laid-out parent, not a real
      // measurement: keeping the previous size avoids a flash of nothing and
      // keeps every derived dimension finite and non-negative. The finiteness
      // check matters as much as the sign one — a NaN would pass `<= 0` and
      // poison every downstream path coordinate.
      if (!Number.isFinite(width) || !Number.isFinite(height)) return;
      if (width <= 0 || height <= 0) return;
      pending = { width, height };
      if (scheduled) return;
      scheduled = true;
      if (typeof requestAnimationFrame === "function") {
        frame = requestAnimationFrame(commit);
      } else {
        commit();
      }
    });

    observer.observe(element);
    return () => {
      observer.disconnect();
      cancelFrame();
      if (settleTimer) clearTimeout(settleTimer);
    };
  }, []);

  return [
    ref,
    {
      width: box.width,
      height: box.height,
      measured: box.measured,
      animate: settled && !reduceMotion,
    },
  ];
}

export interface ResponsiveChartSurfaceProps {
  /** Rendered with the measured body size. Called again on every real change. */
  readonly children: (size: ChartSurfaceSize) => ReactNode;
  /** Below this the surface renders nothing rather than an unreadable scribble. */
  readonly minimumWidth?: number;
  readonly minimumHeight?: number;
  readonly fallbackWidth?: number;
  readonly fallbackHeight?: number;
  readonly className?: string;
  readonly testId?: string;
}

/**
 * Fills a `relative` parent and hands its own measured size to `children`.
 *
 * The parent owns the box; this owns nothing but the measurement. Overflow is
 * hidden here as a last-resort boundary, but the charts are expected to fit —
 * the browser suite asserts each chart's rectangle against this element's, so
 * clipping shows up as a test failure rather than as a chart that "looks fine".
 */
export function ResponsiveChartSurface({
  children,
  minimumWidth = ANALYTICS_CHART_MIN_WIDTH,
  minimumHeight = ANALYTICS_CHART_MIN_HEIGHT,
  fallbackWidth,
  fallbackHeight,
  className,
  testId = "analytics-chart-surface",
}: ResponsiveChartSurfaceProps) {
  const [ref, size] = useChartSize({
    ...(fallbackWidth === undefined ? {} : { fallbackWidth }),
    ...(fallbackHeight === undefined ? {} : { fallbackHeight }),
  });
  const drawable = size.width >= minimumWidth && size.height >= minimumHeight;
  return (
    <div
      ref={ref}
      data-testid={testId}
      data-chart-measured={size.measured ? "true" : "false"}
      data-chart-width={size.width}
      data-chart-height={size.height}
      className={
        "absolute inset-0 min-h-0 min-w-0 overflow-hidden" + (className ? ` ${className}` : "")
      }
    >
      {drawable ? children(size) : null}
    </div>
  );
}
