"use client";

import type { ReactNode } from "react";

/**
 * Shared titled-bullet-list view for AI result surfaces (Slice 4.AI-14).
 *
 * Used by BOTH the Builder AI panel (Assumptions / Not supported yet / Please
 * review) and the failed-run repair block (Recommendations / safety notes).
 * Both surfaces previously inlined the same `<p>` + `<ul>` pattern with
 * cosmetic drift (margin vs padding, with/without title) — this consolidates
 * the rendering so future AI surfaces never have to re-invent it.
 *
 * Strict contract (no rendering surprises):
 *   - Returns `null` when `items` is empty — callers don't need to gate.
 *   - Title is OPTIONAL (the repair block uses headless lists for
 *     recommendations / safety notes).
 *   - Severity governs the bullet text color only. No background, no border,
 *     no icon — surface-specific wrapping (cards, disclosure) stays in the
 *     caller's JSX so each AI surface keeps its own structural identity.
 *   - The `testId` is rendered on the wrapping `<div>` so existing call-site
 *     test ids (`builder-ai-assumptions`, `repair-recommendations`, …)
 *     continue to resolve unchanged.
 *   - `items` are `ReactNode`, NOT `string`, so callers can pass labels with
 *     inline emphasis if they need it. The shared component never inspects
 *     item content — no leak risk introduced.
 */

export type AiBulletSeverity = "muted" | "warning" | "destructive";

export interface AiBulletListProps {
  /** Optional heading. Omit for headless bullet lists (Repair recommendations / safety notes). */
  readonly title?: string;
  readonly items: readonly ReactNode[];
  /** Default `muted`. `warning` for amber (repair safety notes), `destructive` for red. */
  readonly severity?: AiBulletSeverity;
  /** Stable testId attached to the wrapping `<div>`. Preserves existing call-site ids. */
  readonly testId: string;
}

const SEVERITY_CLASS: Record<AiBulletSeverity, string> = {
  muted: "text-muted-foreground",
  warning: "text-amber-700 dark:text-amber-300",
  destructive: "text-destructive",
};

export function AiBulletList({
  title,
  items,
  severity = "muted",
  testId,
}: AiBulletListProps): ReactNode {
  if (items.length === 0) return null;
  const tone = SEVERITY_CLASS[severity];
  return (
    <div className="text-xs" data-testid={testId}>
      {title ? <p className="font-medium">{title}</p> : null}
      <ul className={`list-disc pl-4 ${tone}`}>
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
