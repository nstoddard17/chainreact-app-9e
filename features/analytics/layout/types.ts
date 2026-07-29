/**
 * Pure grid-layout types for the Analytics dashboard
 * (ANALYTICS-EXPLICIT-LAYOUT-S1-ENGINE-1).
 *
 * PURITY CONTRACT — every module in `features/analytics/layout/` is
 * platform-neutral. No React, no DOM, no browser globals, no CSS, no API
 * client, no repository, no database. The only imports permitted are other
 * modules in this folder and TYPE-ONLY imports from `contracts/`. That is what
 * lets the engine be exhaustively unit-tested as plain arithmetic, and it is
 * the boundary the audit asked for: pointer code answers "where is the
 * pointer", this engine answers "what layout results", persistence answers
 * "how is it stored".
 *
 * See docs/slices/phase-5/analytics/analytics-edit-mode-layout-audit.md.
 */

/**
 * The canonical desktop column count. ONE persisted layout is authored against
 * this width; narrower viewports are render-time projections that never write
 * back (a later stage owns that projection). Locked by the owner decision on
 * ANALYTICS-EXPLICIT-LAYOUT-S1-ENGINE-1.
 *
 * DECLARED IN `contracts/analytics.ts` and re-exported here (S2): the persisted
 * shape's validity depends on it, so the contract owns the number and the
 * engine consumes it. Re-exported so every existing engine import is unchanged.
 */
export { ANALYTICS_CANONICAL_COLUMNS } from "@/contracts/analytics";

/** A rectangle of grid cells. `x`/`y` are 0-based; `w`/`h` are counts, never 0. */
export interface GridRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** A widget's rectangle. The widget's identity plus the cells it owns. */
export interface PlacedWidget extends GridRect {
  readonly widgetId: string;
}

/**
 * A whole board. Order carries NO positional meaning — position is `x`/`y`
 * alone — but it is preserved through every operation so callers (React keys,
 * a later renderer) see a stable array.
 */
export type AnalyticsLayout = readonly PlacedWidget[];

/**
 * The only collision policy this engine implements, and deliberately so:
 * widgets displaced by a placement move DOWN, never up and never sideways, and
 * nothing is ever compacted automatically. Gaps are first-class.
 */
export type CollisionPolicy = "push-down";

export interface PlacementOptions {
  readonly columnCount: number;
  readonly collisionPolicy: CollisionPolicy;
}

/** Why a layout is not valid. One code per distinct repair the caller can make. */
export type LayoutProblemCode =
  | "duplicate-id"
  | "non-integer"
  | "negative-coordinate"
  | "invalid-size"
  | "exceeds-columns"
  | "overlap";

export interface LayoutProblem {
  readonly code: LayoutProblemCode;
  /** The widget the problem is attributed to; both ids for an overlap. */
  readonly widgetIds: readonly string[];
  /** Developer-facing. Never rendered to a user as-is. */
  readonly message: string;
}

export type LayoutValidation =
  | { readonly ok: true }
  | { readonly ok: false; readonly problems: readonly LayoutProblem[] };

/** Why an operation refused. Callers switch on this rather than parsing text. */
export type LayoutFailureReason =
  | "unknown-widget"
  | "duplicate-id"
  | "invalid-rect"
  | "exceeds-columns"
  | "collision-unresolved";

/**
 * Typed result. Operations NEVER throw for caller input and never return a
 * half-valid layout: `ok: true` guarantees `validateLayout` passes.
 */
export type LayoutResult =
  | { readonly ok: true; readonly layout: AnalyticsLayout }
  | { readonly ok: false; readonly reason: LayoutFailureReason; readonly message: string };

export function layoutFailure(
  reason: LayoutFailureReason,
  message: string,
): Extract<LayoutResult, { ok: false }> {
  return { ok: false, reason, message };
}
