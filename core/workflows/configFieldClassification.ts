/**
 * Pure classifier for "what setup state is this config field value in?"
 * (Slice 4.TEMPLATE-SETUP-UX-1).
 *
 * Template-created (and AI-planned) workflows land in the builder with a mix of:
 *   - fields safely PRE-FILLED with portable `{{nodeId.path}}` variable references
 *     (verified against upstream output contracts during prewiring), and
 *   - account-specific fields left BLANK for the user to choose.
 * The builder needs to explain that mix in plain English instead of showing raw
 * `{{...}}` syntax or a mystery blank. This helper is the single, pure decision
 * point the field renderers consume to pick the right affordance.
 *
 * It is intentionally provider-agnostic and metadata-free: it classifies the
 * VALUE SHAPE plus the field's `required` flag plus a boolean the caller computes
 * (via the design-time `_variableValidator`) for whether any reference fails to
 * resolve against the available upstream sources. Friendly source-label resolution
 * (needs node/provider/output metadata) happens in the builder layer that consumes
 * this — never here — so `core/` stays dependency-light and unit-testable.
 *
 * Reuses the same `{{...}}` tokenizer (`parseReferences`) the field validator,
 * patch validator, and data-map use, and the same "empty" definition
 * (`isRequiredValueMissing`) the readiness validator uses — so this can never
 * disagree with them about what a reference IS or what counts as blank.
 *
 * It does NOT resolve variables, mutate config, or call the runtime resolver —
 * resolver semantics are owned solely by `workflow-engine/variables/resolveValue.ts`.
 */

import { parseReferences } from "./variableReferences";
import { isRequiredValueMissing } from "./requiredFields";

/**
 * The setup state of one config field value. Maps 1:1 to the five categories the
 * UX needs:
 *   - `needs_input`         — empty AND required (the user must still choose this).
 *   - `optional_empty`      — empty AND not required (nothing to show).
 *   - `literal`             — a static value with no variable references.
 *   - `prefilled_variable`  — the WHOLE value is one `{{...}}` reference.
 *   - `prefilled_mixed`     — a string mixing literal text with >=1 reference.
 *   - `unresolved_reference`— has >=1 reference that does NOT resolve against the
 *                             available upstream sources (never "complete").
 */
export type ConfigFieldSetupState =
  | "needs_input"
  | "optional_empty"
  | "literal"
  | "prefilled_variable"
  | "prefilled_mixed"
  | "unresolved_reference";

export interface ClassifyConfigFieldInput {
  /** The current field value. Non-string values carry no `{{...}}` references. */
  readonly value: unknown;
  /** Whether the field is required (drives `needs_input` vs `optional_empty`). */
  readonly required: boolean;
  /**
   * True when the consuming layer determined that at least one `{{...}}`
   * reference in `value` cannot resolve against the available upstream sources
   * (e.g. `_variableValidator.validateReferences(...).length > 0`). Default
   * false — callers without source context treat references as resolvable in
   * shape, and the runtime resolver remains the authoritative gate.
   */
  readonly hasUnresolvedReference?: boolean;
}

/**
 * True when the entire (trimmed) value is exactly one `{{...}}` token — i.e. the
 * field is wired straight to a single upstream output, not interpolated into
 * surrounding text. Non-strings and multi-token / mixed strings return false.
 */
export function isWholeValueReference(
  value: unknown,
  refs = parseReferences(value),
): boolean {
  if (typeof value !== "string") return false;
  return refs.length === 1 && value.trim() === refs[0]!.token;
}

/**
 * Classify one config field value into its setup state. Pure: no I/O, no
 * registry, no resolver call, no mutation.
 */
export function classifyConfigFieldValue(
  input: ClassifyConfigFieldInput,
): ConfigFieldSetupState {
  const { value, required, hasUnresolvedReference = false } = input;
  const refs = parseReferences(value);

  if (refs.length > 0) {
    if (hasUnresolvedReference) return "unresolved_reference";
    return isWholeValueReference(value, refs)
      ? "prefilled_variable"
      : "prefilled_mixed";
  }

  if (isRequiredValueMissing(value)) {
    return required ? "needs_input" : "optional_empty";
  }
  return "literal";
}

/** Convenience: true for the two states that mean "safely pre-filled from upstream data". */
export function isPrefilledState(state: ConfigFieldSetupState): boolean {
  return state === "prefilled_variable" || state === "prefilled_mixed";
}
