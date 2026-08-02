import type { OutputMeta } from "@/contracts/actionMeta";
import { parseReferences } from "@/core/workflows/variables/variableReferences";
import { resolveValueAtPath } from "@/core/workflows/resolveValueAtPath";
import type { VariableSource } from "../../hooks/useUpstreamVariables";

/**
 * Is the variable wired into a NUMBER field capable of producing a number?
 * (SPREADSHEET-GUIDED-CONFIG-S3.)
 *
 * The sharp edge this exists for is real and was verified against the
 * runtime: the config resolver preserves the underlying type of a
 * single-reference template, so `{{find_row.rowNumber}}` resolving to a
 * number parses fine — while an upstream output declared as a STRING
 * arrives as `"5"`, which `z.number()` rejects. The workflow then fails at
 * run time, on a live row, with a schema error, and the author has no way
 * to have seen it coming.
 *
 * Deliberately NOT a general cross-field type-analysis framework. It
 * answers one question about one field type, using metadata the builder
 * already has (`OutputMeta.type`), and it is provider-agnostic: it knows
 * about number fields and upstream outputs, not about Excel or row
 * numbers.
 *
 * The three outcomes are graded by how much the builder actually knows:
 *
 *   - `ok` — a literal number, or a reference to an output declared
 *     `number`/`integer`.
 *   - `blocked` — a reference to an output the metadata declares is a
 *     STRING. This is the one case the builder can be sure about, so it is
 *     the only one that blocks.
 *   - `unverified` — the reference points somewhere with no declared type
 *     (a dynamic trigger payload, a nested path, an output whose type is
 *     `any`). A warning, never a block: refusing a configuration because
 *     the system lacks metadata would punish the user for a gap that is
 *     ours, and runtime validation remains authoritative either way.
 */

export interface NumberFieldProblem {
  readonly kind: "blocked" | "unverified" | "broken";
  readonly message: string;
}

export type NumberFieldCompatibility = { readonly kind: "ok" } | NumberFieldProblem;

/** Narrowing helper — a result the UI has something to say about. */
export function isNumberFieldProblem(
  result: NumberFieldCompatibility,
): result is NumberFieldProblem {
  return result.kind !== "ok";
}

/**
 * Output types that definitely produce a number at run time. `OutputType`
 * has a single numeric member — there is no separate integer type — so
 * "is it a whole number" stays a runtime question, as it must: the schema
 * is authoritative about that, not the builder.
 */
const NUMERIC_TYPES = new Set(["number"]);
/**
 * Output types that definitely do NOT. `"unknown"` is deliberately absent:
 * it is the declaration for "we don't know", which is the warning case.
 */
const NON_NUMERIC_TYPES = new Set([
  "string",
  "boolean",
  "array",
  "object",
  "fileRef",
]);

/** Walk `fields` down a dotted path to the declared output, if there is one. */
function outputAtPath(
  outputs: readonly OutputMeta[],
  path: string,
): OutputMeta | undefined {
  const segments = path.split(".").filter((s) => s.length > 0);
  if (segments.length === 0) return undefined;
  let current: OutputMeta | undefined;
  let pool: readonly OutputMeta[] = outputs;
  for (const segment of segments) {
    current = pool.find((o) => o.name === segment);
    if (!current) return undefined;
    pool = current.fields ?? [];
  }
  return current;
}

export interface CheckNumberFieldInput {
  /** The field's current value, straight from the draft. */
  readonly value: unknown;
  /** Human label used in the messages. */
  readonly fieldLabel: string;
  readonly sources: readonly VariableSource[];
  /** Latest captured output per source id, when the step has been tested. */
  readonly latestValuesBySource?: Readonly<Record<string, unknown>> | undefined;
}

export function checkNumberFieldCompatibility(
  input: CheckNumberFieldInput,
): NumberFieldCompatibility {
  const { value, fieldLabel, sources, latestValuesBySource } = input;

  // A real number, or nothing yet — neither is this check's business.
  if (typeof value === "number" || value === undefined || value === null) {
    return { kind: "ok" };
  }
  if (typeof value !== "string") return { kind: "ok" };

  const references = parseReferences(value);
  if (references.length === 0) return { kind: "ok" };

  // More than one reference means the template is CONCATENATED, and a
  // concatenation is always a string — the resolver only preserves a type
  // when the whole value is one reference.
  if (references.length > 1 || value.trim() !== rebuildToken(references[0]!)) {
    return {
      kind: "blocked",
      message: `${fieldLabel} has to be a whole number, but this combines text with data from an earlier step, which always produces text. Use a single value from an earlier step on its own.`,
    };
  }

  const reference = references[0]!;
  const source = sources.find((s) => s.sourceId === reference.nodeId);
  if (!source) {
    return {
      kind: "broken",
      message: `${fieldLabel} points at a step that isn't in this workflow any more. Choose a value from a step that still exists.`,
    };
  }

  const declared = outputAtPath(source.outputs, reference.path);
  const declaredType = declared?.type as string | undefined;

  if (declaredType && NUMERIC_TYPES.has(declaredType)) return { kind: "ok" };

  if (declaredType && NON_NUMERIC_TYPES.has(declaredType)) {
    return {
      kind: "blocked",
      message: `${fieldLabel} has to be a whole number, but “${source.displayName}” gives ${describeType(declaredType)} here. Pick a value from an earlier step that is a number.`,
    };
  }

  // No declared type. If the step HAS been tested, the captured value is
  // better evidence than the metadata — and it is evidence about this exact
  // workflow rather than about the action in general.
  const captured = latestValuesBySource?.[reference.nodeId];
  if (captured !== undefined) {
    const found = resolveValueAtPath(captured, reference.path);
    const resolved = found.found ? found.value : undefined;
    if (typeof resolved === "number") return { kind: "ok" };
    if (typeof resolved === "string" && !isWholeNumberText(resolved)) {
      return {
        kind: "blocked",
        message: `${fieldLabel} has to be a whole number, but your last test produced text here. Pick a value from an earlier step that is a number.`,
      };
    }
  }

  return {
    kind: "unverified",
    message: `We can't tell whether this produces a whole number. ${fieldLabel} has to be one, and the run will stop if it isn't.`,
  };
}

/** Rebuild the canonical `{{node.path}}` form of a parsed reference. */
function rebuildToken(reference: {
  readonly nodeId: string;
  readonly path: string;
}): string {
  if (reference.path.length === 0) return `{{${reference.nodeId}}}`;
  return reference.path.startsWith("[")
    ? `{{${reference.nodeId}${reference.path}}}`
    : `{{${reference.nodeId}.${reference.path}}}`;
}

function isWholeNumberText(text: string): boolean {
  return /^-?\d+$/.test(text.trim());
}

function describeType(type: string): string {
  switch (type) {
    case "string":
      return "text";
    case "boolean":
      return "a yes/no value";
    case "array":
      return "a list";
    case "object":
      return "a group of values";
    default:
      return "something that isn't a number";
  }
}
