import { isVisibleWhenMet, type FieldMeta } from "@/contracts/actionMeta";
import { validateSchemaFieldsValue } from "./_schemaFieldsValidator";

/**
 * Save-gate helper for `schema-fields` editors (AI-PROVIDER-4 CS-4).
 *
 * Mirrors `collectJsonFieldBlockingError`: walk a node's fields, validate
 * every VISIBLE `schema-fields` value, and return the first blocking
 * message (or `null`). Used by `ConfigModalShell` to gate Save and by the
 * builder validation drawer for the same rule.
 *
 * A field hidden by an unmet `visibleWhen` is SKIPPED — a schema for a mode
 * the author isn't using is not a decision they owe right now, matching
 * `missingRequiredFields` / readiness behavior everywhere else.
 */
export function collectSchemaFieldsBlockingError(
  fields: readonly FieldMeta[],
  values: Readonly<Record<string, unknown>>,
): string | null {
  for (const field of fields) {
    if (field.type !== "schema-fields") continue;
    if (!isVisibleWhenMet(field.visibleWhen, values)) continue;
    const result = validateSchemaFieldsValue(values[field.name], {
      required: field.required === true,
    });
    if (result.error !== null) return `${field.label}: ${result.error}`;
  }
  return null;
}
