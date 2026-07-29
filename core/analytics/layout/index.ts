/**
 * The Analytics grid-layout engine (ANALYTICS-EXPLICIT-LAYOUT-S1-ENGINE-1).
 *
 * A pure, platform-neutral answer to one question: what valid layout results
 * from placing this footprint there? No React, no DOM, no CSS, no API, no
 * database — see `types.ts` for the purity contract.
 *
 * Not yet wired into the dashboard: the persisted schema, the renderer, the
 * drag session, resize and add-widget still run on the ordered-array model and
 * are changed by later stages.
 */

export {
  ANALYTICS_CANONICAL_COLUMNS,
  layoutFailure,
  type AnalyticsLayout,
  type CollisionPolicy,
  type GridRect,
  type LayoutFailureReason,
  type LayoutProblem,
  type LayoutProblemCode,
  type LayoutResult,
  type LayoutValidation,
  type PlacedWidget,
  type PlacementOptions,
} from "./types";

export {
  bottomOf,
  fitsWithinColumns,
  isWellFormedRect,
  lowestBottom,
  rectsOverlap,
  rightOf,
} from "./geometry";

export { validateLayout } from "./validateLayout";
export { findFirstAvailableRect } from "./findFirstAvailableRect";
export { placeWidget } from "./placeWidget";
export { resizeWidget, resizeWidgetToFootprint } from "./resizeWidget";
export {
  ANALYTICS_SIZE_FOOTPRINT,
  footprintForSize,
  type WidgetFootprint,
} from "./widgetSizeMap";
export {
  migrateLegacyOrderedLayout,
  type LegacyOrderedWidget,
} from "./legacyMigration";

export {
  normalizeDashboardWidgets,
  type AnalyticsLayoutProblem,
  type AnalyticsLayoutProblemCode,
  type AnalyticsLayoutSource,
  type NormalizedDashboardWidgets,
} from "./normalizeDashboardWidgets";

export {
  serializeDashboardWidgets,
  type LayoutPersistenceIntent,
  type SerializeFailureReason,
  type SerializeResult,
} from "./serializeDashboardWidgets";
