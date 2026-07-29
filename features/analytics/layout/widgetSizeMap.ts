import type { AnalyticsWidgetSize } from "@/contracts/analytics";

/**
 * The canonical size-preset → grid-footprint map
 * (ANALYTICS-EXPLICIT-LAYOUT-S1-ENGINE-1).
 *
 * SINGLE SOURCE OF TRUTH. Migration, rendering, drag, resize and add-widget all
 * read the footprint of a preset from here — nowhere else. The audit traced the
 * shipped meanings out of the Tailwind span classes in `features/analytics/
 * Widget.tsx` (`SIZE_GRID_CLASS`); those values are reproduced EXACTLY below,
 * and a test asserts the two agree cell-for-cell so they cannot drift while
 * both exist. A later stage retires the class map in favour of explicit
 * placement derived from these footprints.
 *
 * `import type` only — this module stays free of Zod, React and the DOM.
 */

export interface WidgetFootprint {
  /** Columns spanned. */
  readonly w: number;
  /** Rows spanned. */
  readonly h: number;
}

export const ANALYTICS_SIZE_FOOTPRINT: Readonly<
  Record<AnalyticsWidgetSize, WidgetFootprint>
> = {
  s: { w: 1, h: 1 },
  m: { w: 2, h: 1 },
  l: { w: 2, h: 2 },
  xl: { w: 3, h: 1 },
  w: { w: 4, h: 1 },
  tall: { w: 1, h: 2 },
};

/** The footprint a size preset reserves, as columns × rows. */
export function footprintForSize(size: AnalyticsWidgetSize): WidgetFootprint {
  return ANALYTICS_SIZE_FOOTPRINT[size];
}
