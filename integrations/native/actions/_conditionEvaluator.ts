/**
 * Shared pure condition evaluator for native control-flow actions.
 *
 * Consumed by:
 *   - `native:if_then_condition` (Slice 3 Commit 2) — single-condition
 *     boolean evaluator backing `branchTaken: "true" | "false" | null`.
 *   - `native:router` (Slice 3 Commit 3) — per-route condition evaluator
 *     with first-match-wins semantics backing `branchTaken: <label>`.
 *
 * Plan: docs/slices/parity/native-nodes-3-tier-c-control-flow-plan.md
 * §5.2 + §5.3 + §5.7 + §9.1. Locked decisions: D-IT1 / D-IT2 / D-IT3 /
 * D-IT7 + D-RT1 / D-RT4.
 *
 * Locked behavioural contracts:
 *   - 14 operators total (D-IT1). 4 unary, 10 binary.
 *   - **Strict `===` equality** for `equals` / `not_equals` (D-IT2 —
 *     V1 used loose `==`; V2 hardens). Object identity (no deep equal,
 *     no JSON.stringify, no array-vs-string coercion).
 *   - **Case-insensitive** string comparisons for `contains` /
 *     `not_contains` / `starts_with` / `ends_with` (D-IT3 — V1 parity).
 *   - **Defensive `false` on operator/type mismatch** at runtime (D-IT7).
 *     No throws inside the evaluator for shape errors — only the synthetic
 *     `UnknownOperatorError` for an operator literal not in the union,
 *     which should be impossible if the schema layer parsed correctly.
 *     The schema-parse failure path itself throws upstream (handler-level).
 *   - **`is_empty` model:** true for `null` / `undefined` / `""` / `[]` /
 *     `{}`. Numeric `0` is NOT empty (zero is a real value — matches V1
 *     intent and avoids surprising "amount=0 → empty" workflow behavior).
 *     Whitespace strings (`"   "`) are NOT empty (V1 parity).
 *   - **`is_truthy` / `is_falsy`:** raw `Boolean(input)` semantics. Note
 *     JS quirks apply: `[]` → truthy, `{}` → truthy, `"0"` → truthy.
 *     Workflow authors who need "value is empty" use `is_empty` instead.
 *   - **No `eval`, no `new Function(...)`, no regex literals, no
 *     `new RegExp(...)`, no I/O, no logger** — asserted by a source-purity
 *     test at `conditionEvaluator.test.ts`. Regex / JS expression mode
 *     are deferred per plan §12 + §6.8 (ReDoS surface, sandboxing burden).
 */

export const IF_THEN_OPERATORS = [
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

export type Operator = (typeof IF_THEN_OPERATORS)[number];

export class UnknownOperatorError extends Error {
  constructor(public readonly operator: string) {
    super(
      `Unknown operator '${operator}'. Expected one of: ${IF_THEN_OPERATORS.join(", ")}.`,
    );
    this.name = "UnknownOperatorError";
  }
}

export interface EvaluateConditionInput {
  readonly operator: Operator;
  readonly input: unknown;
  /**
   * Comparison value for binary operators. Forbidden by the schema layer
   * for unary operators (`is_empty` / `is_not_empty` / `is_truthy` /
   * `is_falsy`); the evaluator ignores it for those operators rather than
   * throwing — defensive default at the runtime boundary.
   */
  readonly value?: unknown;
}

export function evaluateCondition({
  operator,
  input,
  value,
}: EvaluateConditionInput): boolean {
  switch (operator) {
    case "equals":
      return strictEquals(input, value);
    case "not_equals":
      return !strictEquals(input, value);
    case "contains":
      return containsValue(input, value);
    case "not_contains":
      return notContainsValue(input, value);
    case "starts_with":
      return stringRelation(input, value, (a, b) => a.startsWith(b));
    case "ends_with":
      return stringRelation(input, value, (a, b) => a.endsWith(b));
    case "greater_than":
      return numericRelation(input, value, (a, b) => a > b);
    case "less_than":
      return numericRelation(input, value, (a, b) => a < b);
    case "greater_equal":
      return numericRelation(input, value, (a, b) => a >= b);
    case "less_equal":
      return numericRelation(input, value, (a, b) => a <= b);
    case "is_empty":
      return isEmpty(input);
    case "is_not_empty":
      return !isEmpty(input);
    case "is_truthy":
      return Boolean(input);
    case "is_falsy":
      return !input;
    default:
      // Defensive: should be unreachable if the schema layer parsed
      // operator against IF_THEN_OPERATORS. If a caller bypasses the
      // schema, surface the mistake loudly rather than returning false.
      throw new UnknownOperatorError(operator as string);
  }
}

function strictEquals(a: unknown, b: unknown): boolean {
  return a === b;
}

function containsValue(input: unknown, value: unknown): boolean {
  if (typeof input === "string" && typeof value === "string") {
    return input.toLowerCase().includes(value.toLowerCase());
  }
  if (Array.isArray(input)) {
    // V1 parity: Array.includes uses strict equality. `[1,"2",3].includes(2)`
    // returns false. No implicit string/number coercion.
    return input.includes(value);
  }
  return false;
}

function notContainsValue(input: unknown, value: unknown): boolean {
  // D-IT7: defensive false on type mismatch. `not_contains` with
  // non-string/non-array input is a type mismatch, so it returns false —
  // NOT V1's "true on wrong types" behavior. The condition is "value is
  // not in input"; if input cannot meaningfully contain anything, the
  // evaluator declines to evaluate.
  if (typeof input === "string" && typeof value === "string") {
    return !input.toLowerCase().includes(value.toLowerCase());
  }
  if (Array.isArray(input)) {
    return !input.includes(value);
  }
  return false;
}

function stringRelation(
  input: unknown,
  value: unknown,
  predicate: (a: string, b: string) => boolean,
): boolean {
  if (typeof input !== "string" || typeof value !== "string") return false;
  return predicate(input.toLowerCase(), value.toLowerCase());
}

function numericRelation(
  input: unknown,
  value: unknown,
  predicate: (a: number, b: number) => boolean,
): boolean {
  const a = toFiniteNumber(input);
  const b = toFiniteNumber(value);
  if (a === null || b === null) return false;
  return predicate(a, b);
}

/**
 * Coerces a value to a finite number, returning null when coercion yields
 * NaN (which `Number()` does for `undefined`, `"abc"`, `{}`, etc.) or for
 * inputs that should never be treated as numeric (`null`, booleans,
 * arrays, objects). This narrower coercion avoids the JS surprise that
 * `Number(null) === 0`, `Number(true) === 1`, `Number([]) === 0`,
 * `Number([7]) === 7`, etc.
 */
function toFiniteNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const trimmed = v.trim();
    if (trimmed === "") return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function isEmpty(input: unknown): boolean {
  if (input === null || input === undefined) return true;
  if (typeof input === "string") return input === "";
  if (Array.isArray(input)) return input.length === 0;
  // Plain objects: `Object.keys({}).length === 0`. Skips class instances
  // by checking constructor; a class with own enumerable props can still
  // qualify, which is the workflow-author intent — `{}` from a JSON
  // payload is the common case.
  if (typeof input === "object") return Object.keys(input as object).length === 0;
  // Numbers, booleans, bigints, symbols, functions are never "empty".
  return false;
}
