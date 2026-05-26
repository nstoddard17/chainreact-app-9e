"use client";

import type { ReactNode } from "react";

/**
 * Shared "Need from you / More information needed" required-input view
 * (Slice 4.AI-14).
 *
 * The Builder AI panel and the failed-run repair block both render a
 * title + bulleted list of items the user must still provide. The Builder
 * surface uses a bordered "card" variant (planner needs-input block sits
 * inside a callout); the repair surface uses a flat "plain" variant. Both
 * variants share the same per-item rendering rules, so the wrapping
 * difference is just a className switch — extracted here so future AI
 * surfaces don't re-implement either.
 *
 * Item shape. The planner's `AiRequiredUserInput` and the repair service's
 * `AiRepairRequiredUserInput` differ only in `nodeId` cardinality (planner
 * optional, repair required). The shared view never reads `nodeId` — it
 * only renders `label` + (optionally) the metadata field key, both of which
 * are present on both shapes. A structural type captures the intersection.
 *
 * `showFieldHint` defaults to false so existing Builder behavior is byte-
 * preserved (Builder's items never have `field` populated today, so the
 * extension would never render — explicitly defaulting off documents the
 * intent and protects against a future planner change starting to populate
 * `field` and silently changing Builder UX). Repair passes `true`.
 */

export interface AiRequiredInputItem {
  readonly label: string;
  readonly field?: string;
}

export type AiRequiredInputVariant = "card" | "plain";

export interface AiRequiredInputListProps {
  readonly title: string;
  readonly items: readonly AiRequiredInputItem[];
  readonly testId: string;
  /** `"card"` (Builder needs-input callout) | `"plain"` (Repair flat list). Default `"plain"`. */
  readonly variant?: AiRequiredInputVariant;
  /** Show ` (field: <name>)` next to the label when present. Default `false`. */
  readonly showFieldHint?: boolean;
}

const WRAPPER_CLASS: Record<AiRequiredInputVariant, string> = {
  card: "rounded border border-input bg-background p-2 text-xs",
  plain: "flex flex-col gap-1 text-xs",
};

export function AiRequiredInputList({
  title,
  items,
  testId,
  variant = "plain",
  showFieldHint = false,
}: AiRequiredInputListProps): ReactNode {
  if (items.length === 0) return null;
  return (
    <div data-testid={testId} className={WRAPPER_CLASS[variant]}>
      <p className="font-medium">{title}</p>
      <ul className="mt-1 list-disc pl-4 text-muted-foreground">
        {items.map((r, i) => (
          <li key={`${r.label}-${i}`}>
            {r.label}
            {showFieldHint && r.field ? (
              <span className="text-muted-foreground/70"> (field: {r.field})</span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
