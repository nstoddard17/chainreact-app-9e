/**
 * The canonical size-preset → grid-footprint map, re-exported
 * (ANALYTICS-EXPLICIT-LAYOUT-S1-ENGINE-1 · moved down in S2).
 *
 * SINGLE SOURCE OF TRUTH, now declared in `contracts/analytics.ts` beside the
 * size enum whose meaning it defines. It moved there because the PERSISTED
 * shape depends on it: a stored `layout.w/h` is only valid when it matches the
 * stored `size` preset, and that rule is enforced inside `AnalyticsWidgetSchema`
 * itself. A contract cannot import a feature, so the map had to live below both.
 *
 * This module remains the engine's import site so every existing consumer is
 * unchanged, and so there is still exactly one definition. Do not re-declare
 * these values anywhere — migration, validation, rendering, drag, resize and
 * add-widget all read them from here or from the contract directly.
 */

export {
  ANALYTICS_SIZE_FOOTPRINT,
  footprintForSize,
  type AnalyticsWidgetFootprint as WidgetFootprint,
} from "@/contracts/analytics";
