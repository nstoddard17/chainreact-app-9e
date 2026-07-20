import type { FieldMeta } from "@/contracts/actionMeta";
import { isVisibleWhenMet } from "@/contracts/actionMeta";

/**
 * 5.DUAL-BUILDER-1 CS-2 — pure Guided-Stop capability classification.
 *
 * Decides how a clicked Document chip is edited. The rule is honesty over
 * cleverness: a field is edited inline ONLY when the real single-field
 * renderer can carry its full contract; anything that needs more context
 * opens the existing step-level inspector instead of a partial editor.
 *
 * `inspector` cases:
 *   - `sensitivity: "secret" | "connection"` — never rendered/valued inline
 *     in prose (existing redaction conventions).
 *   - composite-managed fields (`renderedBy`) — committed by their owner's
 *     larger editor.
 *   - structural / multi-field editors (`router-routes`, `spreadsheet-rows`)
 *     — the renderer owns more than this one value.
 *   - a field currently hidden by an unmet `visibleWhen` (its mode isn't on).
 */

export type GuidedStopPlan =
  | { readonly kind: "inline"; readonly field: FieldMeta }
  | { readonly kind: "inspector"; readonly reason: GuidedStopInspectorReason };

export type GuidedStopInspectorReason =
  | "sensitive_field"
  | "composite_field"
  | "structural_editor"
  | "hidden_field"
  | "unknown_field";

const STRUCTURAL_FIELD_TYPES: ReadonlySet<string> = new Set([
  "router-routes",
  "spreadsheet-rows",
]);

export function planGuidedStop(
  fields: readonly FieldMeta[],
  fieldName: string,
  values: Readonly<Record<string, unknown>>,
): GuidedStopPlan {
  const field = fields.find((f) => f.name === fieldName);
  if (!field) return { kind: "inspector", reason: "unknown_field" };
  if (field.sensitivity === "secret" || field.sensitivity === "connection") {
    return { kind: "inspector", reason: "sensitive_field" };
  }
  if (field.renderedBy !== undefined) {
    return { kind: "inspector", reason: "composite_field" };
  }
  if (STRUCTURAL_FIELD_TYPES.has(field.type)) {
    return { kind: "inspector", reason: "structural_editor" };
  }
  if (!isVisibleWhenMet(field.visibleWhen, values)) {
    return { kind: "inspector", reason: "hidden_field" };
  }
  return { kind: "inline", field };
}
