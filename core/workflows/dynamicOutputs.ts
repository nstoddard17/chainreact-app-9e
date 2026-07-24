import type {
  ActionMeta,
  DynamicOutputsDeclaration,
  OutputMeta,
  OutputType,
} from "@/contracts/actionMeta";
import {
  UserDefinedSchemaSchema,
  type UserSchemaFieldType,
} from "@/contracts/aiProcessing";

/**
 * Dynamic-output synthesis (AI-PROVIDER-8 CS-8; contract shipped in CS-4).
 *
 * Some actions produce a shape the AUTHOR defines: `ai:analyze_document`
 * in "Pull out specific fields" mode returns exactly the fields the user
 * listed in its `schema-fields` config. The meta's `dynamicOutputs`
 * declarations say WHERE those author-named fields attach
 * (`configField` → `attachUnder`); this helper is the synthesis half —
 * it turns (static meta + committed node config) into the output tree
 * the variable picker, the soft reference validator, and the AI
 * planner's variables tool all read.
 *
 * Sources of truth, and nothing else:
 *   - the COMMITTED config value of `configField`, held to the same
 *     `UserDefinedSchemaSchema` contract the runtime request builder
 *     enforces — an invalid/foreign value synthesizes nothing rather
 *     than guessing;
 *   - the action's own static metadata (declarations, static outputs,
 *     field `defaultValue`s for gate evaluation).
 * Prompts, AI responses, and runtime values are never consulted, so the
 * synthesized tree is stable across runs and identical on every surface.
 *
 * Fail-safe behavior (each case returns the static outputs unchanged for
 * that declaration rather than erroring):
 *   - declaration gated off (`whenField`/`whenValueIn` doesn't match the
 *     committed — or defaulted — mode value);
 *   - schema config absent, empty, or failing the contract (bad name,
 *     duplicate, unknown type, >200 rows, unknown keys);
 *   - `attachUnder` naming an output the meta doesn't declare (already a
 *     meta-load error via `checkDynamicOutputsReferences`; double-guarded
 *     here for hand-built metas in tests).
 *
 * Identity guarantee: when nothing synthesizes, the function returns
 * `meta.outputs` BY REFERENCE — memo-friendly for the builder's
 * per-render source computation, and free for the ~40 providers whose
 * metas declare no `dynamicOutputs` at all.
 */

/**
 * Map a user-schema field type to the variable picker's `OutputType`.
 * Mirrors the extraction validator's coercions: `currency` values are
 * coerced to numbers, `date` values normalize to a `YYYY-MM-DD` string.
 */
const USER_TYPE_TO_OUTPUT_TYPE: Readonly<
  Record<UserSchemaFieldType, OutputType>
> = {
  string: "string",
  number: "number",
  boolean: "boolean",
  date: "string",
  currency: "number",
};

/**
 * Evaluate a declaration's `whenField` gate against the committed config,
 * falling back to the field's declared `defaultValue` when the config has
 * no committed value — the same value the runtime schema would apply
 * (e.g. an untouched Analyze Document node is `mode: "summarize"`).
 *
 * Semantics:
 *   - no `whenField` → always active;
 *   - `whenValueIn` present → active iff the resolved value is a string
 *     in the list;
 *   - `whenField` without `whenValueIn` → active iff the resolved value
 *     is committed and non-empty (presence gate).
 */
function isDeclarationActive(
  decl: DynamicOutputsDeclaration,
  meta: ActionMeta,
  config: Readonly<Record<string, unknown>>,
): boolean {
  if (decl.whenField === undefined) return true;
  let value = config[decl.whenField];
  if (value === undefined) {
    value = meta.fields.find((f) => f.name === decl.whenField)?.defaultValue;
  }
  if (decl.whenValueIn !== undefined) {
    return typeof value === "string" && decl.whenValueIn.includes(value);
  }
  return value !== undefined && value !== null && value !== "";
}

/**
 * Read + validate the committed `schema-fields` value into synthesized
 * child outputs. Anything that fails the committed contract synthesizes
 * nothing — the picker falls back to the static (childless) output.
 */
function synthesizeChildren(
  configValue: unknown,
): readonly OutputMeta[] | null {
  const parsed = UserDefinedSchemaSchema.safeParse(configValue);
  if (!parsed.success) return null;
  return parsed.data.fields.map((field) => ({
    name: field.name,
    type: USER_TYPE_TO_OUTPUT_TYPE[field.type],
    ...(field.description !== undefined
      ? { description: field.description }
      : {}),
  }));
}

/**
 * Synthesize the effective output tree for one action node.
 *
 * Returns `meta.outputs` (same reference) when the meta declares no
 * `dynamicOutputs` or no declaration produces children. Otherwise
 * returns a new array in which each synthesizing target output is
 * shallow-cloned with its `fields` extended; every other output keeps
 * its identity.
 *
 * Duplicate prevention: a synthesized child whose name case-insensitively
 * collides with a static child of the same output is skipped — static
 * metadata wins. (The schema contract already rejects duplicates within
 * itself.)
 */
export function applyDynamicOutputs(
  meta: ActionMeta,
  config: Readonly<Record<string, unknown>> | undefined,
): readonly OutputMeta[] {
  const declarations = meta.dynamicOutputs;
  if (!declarations || declarations.length === 0) return meta.outputs;

  const effectiveConfig = config ?? {};
  const childrenByOutput = new Map<string, readonly OutputMeta[]>();

  for (const decl of declarations) {
    if (!isDeclarationActive(decl, meta, effectiveConfig)) continue;
    const children = synthesizeChildren(effectiveConfig[decl.configField]);
    if (children === null || children.length === 0) continue;
    // Meta-level validation enforces one declaration per attachUnder;
    // first-wins keeps hand-built test metas deterministic anyway.
    if (!childrenByOutput.has(decl.attachUnder)) {
      childrenByOutput.set(decl.attachUnder, children);
    }
  }

  if (childrenByOutput.size === 0) return meta.outputs;

  let changed = false;
  const next = meta.outputs.map((output) => {
    const synthesized = childrenByOutput.get(output.name);
    if (!synthesized) return output;
    const staticChildren = output.fields ?? [];
    const staticNames = new Set(
      staticChildren.map((child) => child.name.toLowerCase()),
    );
    const additions = synthesized.filter(
      (child) => !staticNames.has(child.name.toLowerCase()),
    );
    if (additions.length === 0) return output;
    changed = true;
    return { ...output, fields: [...staticChildren, ...additions] };
  });
  return changed ? next : meta.outputs;
}
