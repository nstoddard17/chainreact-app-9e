/**
 * The builder's responsive layout policy (BUILDER-RESPONSIVE-LAYOUT-1).
 *
 * This file is the ONE place that decides what the builder looks like at a
 * given width. It is pure — no React, no DOM, no imports — so the policy can
 * be tested as a table without mounting anything, and so there is exactly one
 * definition of "medium" in the codebase instead of a `window.innerWidth`
 * comparison scattered through six components.
 *
 * The behavioural model (locked with the owner):
 *
 *   wide    ≥ 1280   Today's desktop builder, unchanged. Rail and config
 *                    panel are in-flow columns; the canvas takes the rest.
 *   medium  900–1279  Canvas gets width priority. The rail is a narrower
 *                    in-flow column that collapses to its spine; the config
 *                    surface stops being an in-flow column and becomes an
 *                    overlay sheet so it can't shrink the canvas to a strip.
 *   narrow  < 900     One surface at a time. The canvas is the full-width
 *                    primary surface; rail AND config are overlay sheets, and
 *                    only one of them may be open.
 *
 * Phones are not a fourth tier: they are `narrow`. The same one-surface-at-a-
 * time model scales down, which is why there is no transform-scaled "mobile
 * builder" and no second builder implementation.
 */

/** Smallest width that still gets the untouched desktop layout. */
export const BUILDER_WIDE_MIN_WIDTH = 1280;
/** Smallest width that still gets an in-flow (non-overlay) agent rail. */
export const BUILDER_MEDIUM_MIN_WIDTH = 900;

export type BuilderLayoutMode = "wide" | "medium" | "narrow";

/**
 * How a secondary surface (agent rail, node config) is presented.
 *
 *   `panel`   — an in-flow column in the workspace row; it takes width away
 *               from the canvas, which is fine when there is width to spare.
 *   `overlay` — a full-height sheet floating over the canvas with a scrim.
 *               The canvas keeps its full width underneath.
 */
export type SurfacePresentation = "panel" | "overlay";

/**
 * How much the header can afford to show.
 *
 *   `full`    — every control inline (the wide desktop header, unchanged).
 *   `compact` — secondary controls move into the overflow menu; one row.
 *   `minimal` — as compact, plus the section tabs move to their own second
 *               row and the identity block drops to the name alone.
 */
export type HeaderDensity = "full" | "compact" | "minimal";

/**
 * Resolve a mode from an available width in CSS pixels.
 *
 * Exported separately from the hook so the boundaries are testable without a
 * `matchMedia` stub, and so a caller that already has a measured width (rather
 * than a viewport) can reuse the same thresholds.
 */
export function resolveBuilderLayoutMode(width: number): BuilderLayoutMode {
  if (width >= BUILDER_WIDE_MIN_WIDTH) return "wide";
  if (width >= BUILDER_MEDIUM_MIN_WIDTH) return "medium";
  return "narrow";
}

/**
 * The agent rail stays an in-flow column until there simply isn't room for a
 * column plus a usable canvas. At `medium` it is narrower (see
 * `railPanelWidth`) rather than absent, because a visible transcript is the
 * point of the rail; below that it becomes a sheet.
 */
export function railPresentation(mode: BuilderLayoutMode): SurfacePresentation {
  return mode === "narrow" ? "overlay" : "panel";
}

/**
 * Node configuration goes to an overlay one tier EARLIER than the rail. A
 * 380px config column at 1024px wide leaves the canvas ~320px once the rail is
 * open — narrower than a single node card, which is the specific failure this
 * slice exists to fix. As an overlay it costs the canvas nothing.
 */
export function configPresentation(mode: BuilderLayoutMode): SurfacePresentation {
  return mode === "wide" ? "panel" : "overlay";
}

/** Expanded in-flow width of the agent rail, in pixels. */
export function railPanelWidth(mode: BuilderLayoutMode): number {
  return mode === "medium" ? 272 : 320;
}

export function headerDensity(mode: BuilderLayoutMode): HeaderDensity {
  if (mode === "wide") return "full";
  return mode === "medium" ? "compact" : "minimal";
}

/**
 * Whether opening one secondary surface must close the other.
 *
 * Only true at `narrow`. At `medium` the config sheet deliberately floats over
 * a canvas that still has the rail beside it — closing the rail there would
 * throw away the transcript the user is working from, and there is enough room
 * for both. At `narrow` there is not: two stacked sheets would leave no canvas
 * visible at all, so the product rule is one at a time.
 */
export function surfacesAreMutuallyExclusive(mode: BuilderLayoutMode): boolean {
  return mode === "narrow";
}
