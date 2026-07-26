/**
 * Resolver-backed dynamic TRIGGER outputs (TYPEFORM-DYNAMIC-OUTPUTS-CONSUMPTION-1).
 *
 * The synthesis half of `TriggerMeta.dynamicOutputSource`. A trigger whose data shape depends on a
 * chosen provider resource — a form's questions, a sheet's columns, a database's properties — declares
 * where its schema comes from; this turns (static meta + the resolved descriptors) into the merged
 * output tree that the variable picker, the Data Map, the agent's context and the reference validator
 * all read.
 *
 * Why this is a PURE function taking already-resolved items, rather than something that fetches:
 * the builder resolves the descriptors through the existing `/api/options` route (client) and the
 * server-side agent path resolves them through `resolveOptionsSource` directly. Both then call THIS
 * to merge. So there is exactly one key generator and one merge rule — a UI copy and an agent copy
 * could disagree, and that disagreement would surface as a mapping that previews correctly and then
 * fails at runtime. Keeping the I/O outside also keeps `core/` free of service imports, per the
 * project-structure rule.
 *
 * Deliberately mirrors `applyDynamicOutputs` (the action-side, user-schema-driven equivalent):
 * identity is preserved when nothing synthesizes, static children always win a name collision, and a
 * declaration that cannot be satisfied degrades to the static outputs rather than erroring.
 */

import type { OutputMeta, OutputType } from "@/contracts/actionMeta";
import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * One resolved schema descriptor. Provider-neutral: whatever discovered it (a Typeform form, a
 * spreadsheet header row, a CRM property list) reduces to this shape before merging.
 */
export interface DynamicOutputDescriptor {
  /** Dot-path-safe key — becomes the child output's name, i.e. the `<attachUnder>.<key>` segment. */
  readonly key: string;
  /** Human-readable label for the picker. */
  readonly label: string;
  /** Normalized value type. Anything unrecognized is treated as a string. */
  readonly type?: string | undefined;
  /** The provider's own durable reference, carried for display/debugging. Never used as the path. */
  readonly providerFieldRef?: string | undefined;
}

const OUTPUT_TYPES: ReadonlySet<string> = new Set([
  "string",
  "number",
  "boolean",
  "object",
  "array",
]);

function toOutputType(type: string | undefined): OutputType {
  return (type !== undefined && OUTPUT_TYPES.has(type) ? type : "string") as OutputType;
}

/** A dot-path-safe key is the only thing the canonical tokenizer can address as one segment. */
const SAFE_KEY_RE = /^[A-Za-z0-9_]+$/;

export interface MergeDynamicTriggerOutputsResult {
  /** The merged tree (or `meta.payloadShape` by reference when nothing synthesized). */
  readonly outputs: readonly OutputMeta[];
  /** Keys rejected because they were unsafe, empty, or duplicated. Names only — safe to surface. */
  readonly rejectedKeys: readonly string[];
  /** True when a declaration exists and at least one child was attached. */
  readonly synthesized: boolean;
}

/**
 * Merge resolved descriptors into a trigger's static output tree.
 *
 * Rules, all fail-safe:
 *   - no declaration, or no descriptors → the static outputs, BY REFERENCE (memo-friendly);
 *   - `attachUnder` naming an output the meta doesn't declare → static outputs unchanged (the schema
 *     already rejects this at load; double-guarded here for hand-built metas);
 *   - a descriptor whose key is empty or not dot-path-safe is REJECTED, not coerced — a key the
 *     canonical tokenizer cannot address would preview fine and fail at runtime, which is worse than
 *     visibly omitting it;
 *   - a duplicate key is rejected (first wins) and reported, so a form with two identical refs fails
 *     VISIBLY rather than silently dropping one question's data;
 *   - a synthesized child that collides with a STATIC child name is skipped — static metadata wins.
 */
export function mergeDynamicTriggerOutputs(
  meta: Pick<TriggerMeta, "payloadShape" | "dynamicOutputSource">,
  descriptors: readonly DynamicOutputDescriptor[],
): MergeDynamicTriggerOutputsResult {
  const declaration = meta.dynamicOutputSource;
  const staticOutputs = meta.payloadShape;
  if (!declaration || descriptors.length === 0) {
    return { outputs: staticOutputs, rejectedKeys: [], synthesized: false };
  }

  const target = staticOutputs.find((o) => o.name === declaration.attachUnder);
  if (!target) return { outputs: staticOutputs, rejectedKeys: [], synthesized: false };

  const staticChildNames = new Set((target.fields ?? []).map((c) => c.name.toLowerCase()));
  const rejectedKeys: string[] = [];
  const seen = new Set<string>();
  const children: OutputMeta[] = [];

  for (const d of descriptors) {
    const key = typeof d.key === "string" ? d.key : "";
    if (key.length === 0 || !SAFE_KEY_RE.test(key)) {
      rejectedKeys.push(key);
      continue;
    }
    if (seen.has(key)) {
      rejectedKeys.push(key);
      continue;
    }
    seen.add(key);
    if (staticChildNames.has(key.toLowerCase())) continue;
    children.push({
      name: key,
      type: toOutputType(d.type),
      ...(d.label ? { description: d.label } : {}),
    });
  }

  if (children.length === 0) {
    return { outputs: staticOutputs, rejectedKeys, synthesized: false };
  }

  const outputs = staticOutputs.map((o) =>
    o.name === declaration.attachUnder ? { ...o, fields: [...(o.fields ?? []), ...children] } : o,
  );
  return { outputs, rejectedKeys, synthesized: true };
}

/**
 * Is this trigger waiting on a schema choice? True when it declares a dynamic source and the config
 * field that drives it is not yet set.
 *
 * This is the signal that distinguishes "waiting for upstream schema" from "requires a user decision"
 * in readiness and in the preview — the difference between *"select the Typeform form first so its
 * questions can be mapped"* and *"choose a Mailchimp audience"*. Conflating them is what made the
 * original proposal look like it merely needed more clicks.
 */
export function isAwaitingDynamicSchema(
  meta: Pick<TriggerMeta, "dynamicOutputSource">,
  config: Readonly<Record<string, unknown>> | undefined,
): boolean {
  const declaration = meta.dynamicOutputSource;
  if (!declaration) return false;
  const value = config?.[declaration.configField];
  return value === undefined || value === null || value === "";
}

/** The `{{...}}` path prefix a dynamic child resolves under, e.g. `answersByRef.email`. */
export function dynamicOutputPath(
  meta: Pick<TriggerMeta, "dynamicOutputSource">,
  key: string,
): string | null {
  const declaration = meta.dynamicOutputSource;
  if (!declaration || !SAFE_KEY_RE.test(key)) return null;
  return `${declaration.attachUnder}.${key}`;
}
