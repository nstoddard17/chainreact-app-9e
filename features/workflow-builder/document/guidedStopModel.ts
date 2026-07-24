import type { FieldMeta } from "@/contracts/actionMeta";
import { isVisibleWhenMet, normalizeDependsOn } from "@/contracts/actionMeta";

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
 *
 * DOC-CONFIG-SYNC-1 adds a third outcome, `prerequisite`: the requested field is
 * inline-editable in principle, but a `dependsOn` parent it needs has no value
 * yet (Property needs an Account; Channel needs a Team; Worksheet needs a
 * Workbook). Opening it would show a permanently-disabled "Select Account first"
 * control and a dead end. Instead the stop draws the PARENT — the actual next
 * decision — and, because the plan is recomputed from the live draft values,
 * advances to the requested field on its own the moment the parent is filled.
 *
 * This is derived entirely from the node's own metadata (`dependsOn`), so it is
 * provider-agnostic by construction: no Document component knows what a Google
 * Analytics property is.
 */

export type GuidedStopPlan =
  | { readonly kind: "inline"; readonly field: FieldMeta }
  | {
      readonly kind: "prerequisite";
      /** The parent to answer FIRST — this is what the stop draws. */
      readonly field: FieldMeta;
      /** What the user originally clicked; guidance returns here once `field` is set. */
      readonly requested: FieldMeta;
    }
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
  /**
   * Field names already on the current prerequisite walk. Internal — a
   * mis-authored `dependsOn` cycle (a → b → a) must refuse, never hang the
   * builder. Callers pass nothing.
   */
  visiting: ReadonlySet<string> = EMPTY_VISITING,
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
  const prerequisite = findMissingPrerequisite(fields, field, values, visiting);
  if (prerequisite) return { kind: "prerequisite", field: prerequisite, requested: field };
  return { kind: "inline", field };
}

const EMPTY_VISITING: ReadonlySet<string> = new Set();

/**
 * The first `dependsOn` parent of `field` that has no value yet AND can itself be
 * answered inline. Parents are checked in declared order, so a multi-parent chain
 * (base → table → column) walks left to right — one question at a time.
 *
 * A parent that is unknown, hidden, sensitive, composite-managed, or structural is
 * NOT redirected to: the Document can't honestly ask it here, so the requested
 * field is drawn as-is and its renderer keeps showing the existing
 * "Select <parent> first" hint. Same "honesty over cleverness" rule as above.
 *
 * Matches SchemaForm's parent-presence rule exactly (`readParentString`): only a
 * non-empty string counts as "the parent has been answered".
 */
function findMissingPrerequisite(
  fields: readonly FieldMeta[],
  field: FieldMeta,
  values: Readonly<Record<string, unknown>>,
  visiting: ReadonlySet<string>,
): FieldMeta | null {
  for (const parentName of normalizeDependsOn(field.dependsOn)) {
    const raw = values[parentName];
    if (typeof raw === "string" && raw.length > 0) continue;
    const parent = fields.find((f) => f.name === parentName);
    if (!parent) continue;
    if (visiting.has(parentName)) return null; // authoring cycle → no redirect
    // `planGuidedStop` on the PARENT tells us whether it is inline-answerable —
    // including its own transitive prerequisites, which is what makes a
    // three-deep chain resolve to the single question that is actually next.
    const next = new Set(visiting);
    next.add(field.name);
    const parentPlan = planGuidedStop(fields, parentName, values, next);
    if (parentPlan.kind === "inline") return parent;
    if (parentPlan.kind === "prerequisite") return parentPlan.field;
    return null;
  }
  return null;
}
