/**
 * Pure validator for the `router-routes` field value.
 *
 * Slice 3.6 — shared by `RouterRoutesField` (renders the inline error
 * + per-row hints) and `ConfigModalShell` (gates the modal Save
 * button when the active node is `native:router` and routes are
 * invalid).
 *
 * Mirrors the runtime contract enforced by
 * `integrations/native/actions/router.schema.ts`:
 *   - routes.length in [1, 32]
 *   - each route.label in [1, 64], unique across routes
 *   - operator is one of the 14 known operators
 *   - binary operators MUST have a non-undefined value
 *   - unary operators MUST NOT have a value
 *
 * The runtime parse happens at handler dispatch; this client-side
 * validator catches "obvious" malformations before save so authors
 * see the error inline instead of as a workflow-run failure. The
 * server-side WorkflowDefinitionSchema does NOT re-parse the router
 * config at save time — `WorkflowNode.config` is opaque
 * `Record<string, unknown>` until handler dispatch — so the
 * client-side gate is the only pre-run guard.
 *
 * Co-located with the renderer (not in `core/`) because it is
 * UI-coupled: the error messages are author-facing and reference
 * row numbers / operator names that only make sense in the renderer's
 * visual order.
 */

// ─── Operators ───────────────────────────────────────────────────────────────
//
// Kept in sync with `integrations/native/actions/_conditionEvaluator.ts`'s
// `IF_THEN_OPERATORS` const. A structural test
// (`tests/structure/router-routes-operator-parity.test.ts`) asserts the
// two lists are identical so drift is caught immediately. Per-project
// `features/` → `integrations/` import boundary forbids a direct
// dependency, hence the duplication.

export const ROUTER_OPERATORS = [
  "equals",
  "not_equals",
  "contains",
  "not_contains",
  "starts_with",
  "ends_with",
  "greater_than",
  "less_than",
  "greater_equal",
  "less_equal",
  "is_empty",
  "is_not_empty",
  "is_truthy",
  "is_falsy",
] as const;
export type RouterOperator = (typeof ROUTER_OPERATORS)[number];

/** Operators that take NO `condition.value` — value field should be hidden. */
export const ROUTER_UNARY_OPERATORS = new Set<RouterOperator>([
  "is_empty",
  "is_not_empty",
  "is_truthy",
  "is_falsy",
]);

export const ROUTER_OPERATOR_LABELS: Readonly<Record<RouterOperator, string>> = Object.freeze({
  equals: "equals",
  not_equals: "does not equal",
  contains: "contains",
  not_contains: "does not contain",
  starts_with: "starts with",
  ends_with: "ends with",
  greater_than: "is greater than",
  less_than: "is less than",
  greater_equal: "is ≥",
  less_equal: "is ≤",
  is_empty: "is empty",
  is_not_empty: "is not empty",
  is_truthy: "is truthy",
  is_falsy: "is falsy",
});

export const ROUTE_LABEL_MAX = 64;
export const ROUTER_MAX_ROUTES = 32;

// ─── Types + normalizer ──────────────────────────────────────────────────────

export interface RouteCondition {
  input: unknown;
  operator: RouterOperator;
  /** Forbidden when operator is unary; required (non-undefined) otherwise. */
  value?: unknown;
}

export interface RouteRow {
  label: string;
  condition: RouteCondition;
}

/**
 * Coerce an unknown `value` (typically pulled out of a configSlice
 * draft) into the row array the renderer iterates. Non-array inputs
 * become `[]` so the renderer can show its empty state cleanly.
 *
 * Per-row coercion is permissive: missing fields become safe defaults
 * (empty string label, equals operator, empty input). The validator
 * below catches the resulting errors and surfaces them inline.
 */
export function asRouteRows(value: unknown): RouteRow[] {
  if (!Array.isArray(value)) return [];
  const rows: RouteRow[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const cond = (e.condition && typeof e.condition === "object"
      ? (e.condition as Record<string, unknown>)
      : {}) as Record<string, unknown>;
    const opCandidate =
      typeof cond.operator === "string" ? cond.operator : "equals";
    const operator: RouterOperator = (ROUTER_OPERATORS as readonly string[]).includes(
      opCandidate,
    )
      ? (opCandidate as RouterOperator)
      : "equals";
    rows.push({
      label: typeof e.label === "string" ? e.label : "",
      condition: {
        input: cond.input,
        operator,
        ...("value" in cond ? { value: cond.value } : {}),
      },
    });
  }
  return rows;
}

// ─── Validation ──────────────────────────────────────────────────────────────

export interface RoutesValidationResult {
  /** Top-level error to render under the field (and to gate Save on). */
  error: string | null;
  /** Per-row error map keyed by row index; missing keys = row is valid. */
  rowErrors: Readonly<Record<number, string>>;
}

/**
 * Validate a `router-routes` field value.
 *
 * Returns `{ error: null, rowErrors: {} }` for valid values. Any
 * non-null `error` or any non-empty `rowErrors` entry indicates the
 * value would be rejected by the runtime schema; the modal Save
 * button must be disabled.
 */
export function validateRoutesValue(value: unknown): RoutesValidationResult {
  if (!Array.isArray(value)) {
    return {
      error: "Add at least one route.",
      rowErrors: {},
    };
  }
  if (value.length === 0) {
    return {
      error: "Add at least one route.",
      rowErrors: {},
    };
  }
  if (value.length > ROUTER_MAX_ROUTES) {
    return {
      error: `Too many routes (max ${ROUTER_MAX_ROUTES}).`,
      rowErrors: {},
    };
  }

  const rows = asRouteRows(value);
  const rowErrors: Record<number, string> = {};
  const seenLabels = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const label = row.label.trim();
    if (label.length === 0) {
      rowErrors[i] = "Label is required.";
      continue;
    }
    if (label.length > ROUTE_LABEL_MAX) {
      rowErrors[i] = `Label is too long (max ${ROUTE_LABEL_MAX}).`;
      continue;
    }
    if (seenLabels.has(label)) {
      rowErrors[i] = `Duplicate label '${label}'.`;
      continue;
    }
    seenLabels.add(label);

    const op = row.condition.operator;
    if (!(ROUTER_OPERATORS as readonly string[]).includes(op)) {
      rowErrors[i] = `Unknown operator '${op}'.`;
      continue;
    }
    const isUnary = ROUTER_UNARY_OPERATORS.has(op);
    // Mirror the runtime schema literally: it rejects only the undefined
    // case for binary operators, not empty-string values. An author who
    // legitimately wants `equals ""` (rare but valid) shouldn't be
    // blocked by the client validator. The renderer's UX nudges authors
    // toward filling the value field, but the validator does not.
    if (isUnary && row.condition.value !== undefined) {
      rowErrors[i] = `Operator '${op}' is unary and does not take a value.`;
      continue;
    }
    if (!isUnary && row.condition.value === undefined) {
      rowErrors[i] = `Operator '${op}' requires a value.`;
      continue;
    }
  }

  const error =
    Object.keys(rowErrors).length > 0
      ? "One or more routes are invalid."
      : null;
  return { error, rowErrors };
}
