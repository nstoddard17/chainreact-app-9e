import type { FieldMeta } from "@/contracts/actionMeta";
import { isRequiredValueMissing } from "@/core/workflows/requiredFields";
import { getReadinessAdapter } from "./adapters";

/**
 * Pure per-node config readiness (SPREADSHEET-CONFIG-REDESIGN-1) — the
 * single decision point behind the readiness banner every node config
 * panel shows at the top of its Setup tab.
 *
 * Derivation only — no new validation rules live here:
 *   - "What's still missing" comes from the metadata's `required` flags
 *     via the SAME `isRequiredValueMissing` the builder validation
 *     collector and server execution-readiness use (a required field
 *     with a metadata `defaultValue` is never a gap — mirrors
 *     `missingRequiredFields`).
 *   - "What's invalid" comes from the draft's inline field errors plus
 *     the shell's existing structural Save blockers (json / router
 *     validators) — passed IN as counts, never recomputed here.
 *   - Action/trigger-specific checklists come from small adapters
 *     (`./adapters`) so domain rules (e.g. Excel's "at least one row
 *     value" either-or) live in one declared place instead of fragile
 *     UI-only logic.
 *
 * Copy contract: product language only. Checklist labels are field
 * LABELS (or adapter copy) — never schema keys, renderer names, or
 * serialization words. "Ready" is about the CONFIG being complete; the
 * footer's dirty/saved state is a separate concern and stays untouched.
 */

export interface ReadinessChecklistItem {
  readonly label: string;
  readonly done: boolean;
}

export type ConfigReadinessStatus = "ready" | "incomplete" | "invalid";

export interface ConfigReadiness {
  readonly status: ConfigReadinessStatus;
  /** Banner headline, e.g. "One thing left to fill in" / "Ready to run". */
  readonly headline: string;
  readonly items: readonly ReadinessChecklistItem[];
}

export interface ComputeConfigReadinessInput {
  /** `provider:type` key — used to look up a checklist adapter. */
  readonly metaKey: string;
  readonly nodeKind: "action" | "trigger";
  readonly fields: readonly FieldMeta[];
  readonly values: Readonly<Record<string, unknown>>;
  /** Draft inline errors keyed by field name (undefined entries ignored). */
  readonly errors?: Readonly<Record<string, string | undefined>>;
  /**
   * Number of fields currently blocked by the shell's structural Save
   * validators (advanced JSON shape, router routes). The shell already
   * computes these to gate Save; the banner reuses the outcome.
   */
  readonly blockedFieldCount?: number;
}

export function computeConfigReadiness(
  input: ComputeConfigReadinessInput,
): ConfigReadiness {
  const { metaKey, nodeKind, fields, values, errors, blockedFieldCount } = input;

  const adapter = getReadinessAdapter(metaKey);
  const items = adapter
    ? adapter({ fields, values })
    : genericChecklist(fields, values);

  const inlineErrorCount = Object.values(errors ?? {}).filter(
    (message) => typeof message === "string" && message.length > 0,
  ).length;
  const invalidCount = inlineErrorCount + (blockedFieldCount ?? 0);

  if (invalidCount > 0) {
    return {
      status: "invalid",
      headline:
        invalidCount === 1
          ? "Fix one field before saving"
          : `Fix ${invalidCount} fields before saving`,
      items,
    };
  }

  const missingCount = items.filter((item) => !item.done).length;
  if (missingCount > 0) {
    return {
      status: "incomplete",
      headline:
        missingCount === 1
          ? "One thing left to fill in"
          : `${missingCount} things left to fill in`,
      items,
    };
  }

  return {
    status: "ready",
    headline: nodeKind === "trigger" ? "Ready to activate" : "Ready to run",
    items,
  };
}

/**
 * Generic checklist: one row per required metadata field (labels only —
 * never field names). Required fields with a metadata `defaultValue` are
 * always satisfiable and never listed (mirrors `missingRequiredFields`).
 */
function genericChecklist(
  fields: readonly FieldMeta[],
  values: Readonly<Record<string, unknown>>,
): ReadinessChecklistItem[] {
  return fields
    .filter((f) => f.required && f.defaultValue === undefined)
    .map((f) => ({
      label: `Fill in ${f.label}`,
      done: !isRequiredValueMissing(values[f.name]),
    }));
}
