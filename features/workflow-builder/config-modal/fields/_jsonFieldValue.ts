import type { FieldMeta } from "@/contracts/actionMeta";

/**
 * CONFIG-UX-AUDIT-2 — shared value logic for `json` fields (the advanced
 * developer JSON escape hatch). ONE source of truth used by:
 *
 *   - `JsonField` (inline error while editing + commit decisions), and
 *   - `collectJsonFieldBlockingError` (the config modal's Save gate).
 *
 * Value contract for a `json` field's COMMITTED config value:
 *   - `undefined` — empty / cleared (requiredness is readiness's job).
 *   - a pure `{{...}}` variable STRING — the runtime resolver replaces a
 *     standalone token with the referenced raw value (array/object), so
 *     the string form is correct at rest.
 *   - a parsed array / object matching `jsonShape` — what runtime
 *     `z.array` / `z.object` / `z.record` schemas expect.
 *   - any other STRING is an in-progress/invalid draft: kept so the
 *     user's typing is never destroyed, but Save is blocked until fixed.
 *
 * All error copy is user-facing product language. Never surface parser
 * exceptions, Zod internals, or renderer names.
 */

export type JsonShape = "array" | "object" | "any";

/** A standalone variable token — the WHOLE trimmed value, nothing else. */
const PURE_VARIABLE_RE = /^\{\{[^{}]+\}\}$/;

export function isPureVariableReference(text: string): boolean {
  return PURE_VARIABLE_RE.test(text.trim());
}

export interface JsonFieldValidation {
  /** User-facing error, or null when the value is committable. */
  error: string | null;
  /**
   * The value to COMMIT into the draft when `error` is null:
   * parsed array/object, the pure-variable string, or undefined.
   */
  committed?: unknown;
}

function shapeError(shape: JsonShape): string | null {
  if (shape === "array") {
    return "This field needs a list — start with [ and end with ].";
  }
  if (shape === "object") {
    return "This field needs an object — start with { and end with }.";
  }
  return null;
}

function matchesShape(parsed: unknown, shape: JsonShape): boolean {
  if (shape === "array") return Array.isArray(parsed);
  if (shape === "object") {
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed);
  }
  return true;
}

/**
 * Validate the RAW EDITOR TEXT of a json field and decide what to commit.
 */
export function validateJsonFieldText(
  text: string,
  shape: JsonShape,
): JsonFieldValidation {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { error: null, committed: undefined };
  }
  if (isPureVariableReference(trimmed)) {
    return { error: null, committed: trimmed };
  }
  if (trimmed.includes("{{")) {
    // Mixed variables + JSON text would resolve to a concatenated STRING
    // at runtime, which the schema rejects — only whole-value variables
    // are supported for this field class.
    return {
      error:
        "To use a value from a previous step here, the variable must be the whole value (for example {{trigger.items}}) — it can't be mixed into JSON text.",
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { error: "This needs valid JSON. Check for missing quotes, commas, or brackets." };
  }
  if (!matchesShape(parsed, shape)) {
    return { error: shapeError(shape) ?? "This value doesn't have the expected shape." };
  }
  return { error: null, committed: parsed };
}

/**
 * Validate an already-COMMITTED config value (draft or saved). Non-string
 * values are checked against the shape; strings are re-run through the
 * text validator (a pure variable passes; anything else is an unfixed
 * draft and blocks Save).
 */
export function validateJsonFieldValue(
  value: unknown,
  shape: JsonShape,
): JsonFieldValidation {
  if (value === undefined || value === null) {
    return { error: null, committed: undefined };
  }
  if (typeof value === "string") {
    return validateJsonFieldText(value, shape);
  }
  if (!matchesShape(value, shape)) {
    return { error: shapeError(shape) ?? "This value doesn't have the expected shape." };
  }
  return { error: null, committed: value };
}

/** Render a committed value back into editor text. */
export function jsonFieldValueToText(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    // Non-JSON-serializable committed values can't occur via this field's
    // own commits; render empty rather than crashing the editor.
    return "";
  }
}

/**
 * Save-gate helper for the config modal: the FIRST json-field error in
 * the draft values, or null when every json field is committable.
 * Returns the field label so the shell can point the user at it.
 */
export function collectJsonFieldBlockingError(
  fields: readonly FieldMeta[],
  values: Readonly<Record<string, unknown>>,
): { fieldName: string; fieldLabel: string; error: string } | null {
  for (const field of fields) {
    if (field.type !== "json") continue;
    const result = validateJsonFieldValue(
      values[field.name],
      field.jsonShape ?? "any",
    );
    if (result.error !== null) {
      return { fieldName: field.name, fieldLabel: field.label, error: result.error };
    }
  }
  return null;
}
