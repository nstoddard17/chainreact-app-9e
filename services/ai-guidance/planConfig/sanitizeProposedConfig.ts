/**
 * Metadata-driven sanitizer for MODEL-PROPOSED config values (REACT-CONFIG-COVERAGE-1).
 *
 * The guidance brain may now propose config VALUES the user explicitly supplied — on a plan step
 * (`WorkflowPlanStep.config`, new-workflow path) or inside `updateNodeConfig` / `addNode` /
 * `replaceTrigger` patch operations (edit path). Those values are UNTRUSTED until this module
 * filters them against the node's REAL registry metadata (`FieldMeta`) — the SAME single source of
 * truth that drives the builder config panel, readiness, and patch validation. There is no second
 * hand-maintained "AI fields" list.
 *
 * Contract per proposed key:
 *   - Undeclared key                     → DROPPED (safe note; handler strict schemas are the law).
 *   - `secret` / `connection` sensitivity → DROPPED (credentials are never model-writable).
 *   - Declared + type-compatible value    → KEPT (coerced: numeric strings → number, "true" →
 *     boolean, CSV/scalar → string-array, static-option LABEL → option VALUE).
 *   - Declared but unusable value         → DEFERRED: the value is removed AND the field key is
 *     surfaced as a targeted user input (`requiredInputs` on a plan step / a safe warning on an
 *     edit) — a user constraint is NEVER silently discarded (product rule 4).
 *   - `{{...}}` variable references pass through untouched (validated by the patch pipeline).
 *   - Explicit `false` and `0` are preserved (no truthiness checks). `""`/null/undefined are
 *     dropped: platform-wide, empty-string means "unset" (see `isRequiredValueMissing`).
 *
 * Complex file/route-backed types (`file`, `file-array`, `router-routes`, `spreadsheet-rows`,
 * `location`) are DEFERRED — the model must not author them; the builder collects them.
 *
 * Pure + deterministic + server-only (reads the frozen in-memory discovery registry; no I/O).
 * Dynamic `optionsSource` value verification/label-mapping is the ASYNC resolver pass
 * (`resolveProposedOptionValues`) — this module keeps such candidates as strings for it.
 */

import type { FieldMeta } from "@/contracts/actionMeta";
import type { WorkflowPlan, WorkflowPlanStep } from "@/contracts/guidanceSession";
import { findFabricatedValueDeep } from "@/core/workflows/fabricatedSampleValues";
import { getActionMeta, getTriggerMeta } from "@/services/discovery/_registry";

/** Field types whose values the model may author directly (before the async options pass). */
const STRING_TYPES: ReadonlySet<string> = new Set([
  "text",
  "textarea",
  "cron",
  "date",
  "time",
  "datetime",
  "datetime-utc",
  "timezone",
]);

/** Complex types the model must never author — always deferred to the builder UI. */
const DEFERRED_TYPES: ReadonlySet<string> = new Set([
  "file",
  "file-array",
  "router-routes",
  "spreadsheet-rows",
  "location",
]);

export interface SanitizedNodeConfig {
  /** The kept (possibly coerced) config values. */
  readonly config: Record<string, unknown>;
  /** Declared fields whose supplied value was unusable — surface as targeted user input. */
  readonly deferredFields: readonly string[];
  /** Keys dropped outright (undeclared / secret / connection). Field KEY names only — no values. */
  readonly droppedFields: readonly string[];
  /**
   * REACT-AGENT-MULTISTEP-DATA-MAPPING-1 — declared fields whose proposed value was an INVENTED
   * identity literal (an email/phone/sample-domain the user never wrote). Removed like any other
   * unusable value, but reported separately so the rail can say something true and specific
   * ("I didn't have real data for Email") instead of the generic "couldn't set this automatically".
   * Field KEY names only — the offending value is never carried out of here.
   */
  readonly fabricatedFields: readonly string[];
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isVariableString(v: unknown): v is string {
  return typeof v === "string" && v.includes("{{");
}

function isEmptyValue(v: unknown): boolean {
  return v === undefined || v === null || (typeof v === "string" && v.trim() === "");
}

/** Map a candidate onto a static option: exact VALUE match, else unique case-insensitive LABEL match. */
function matchStaticOption(field: FieldMeta, raw: string): string | null {
  const options = field.options ?? [];
  if (options.some((o) => o.value === raw)) return raw;
  const lowered = raw.trim().toLowerCase();
  const labelMatches = options.filter(
    (o) => o.label.trim().toLowerCase() === lowered || o.value.toLowerCase() === lowered,
  );
  return labelMatches.length === 1 ? labelMatches[0]!.value : null;
}

function coerceStringArray(v: unknown): string[] | null {
  if (Array.isArray(v)) {
    return v.every((i) => typeof i === "string") ? (v as string[]).filter((s) => s.trim() !== "") : null;
  }
  if (typeof v === "string") {
    const parts = v.includes(",") ? v.split(",") : [v];
    return parts.map((p) => p.trim()).filter((p) => p !== "");
  }
  return null;
}

function coerceNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function coerceBoolean(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  return null;
}

/** Sanitize an `object` / `object-list` item against the field's declared `itemFields`. */
function sanitizeItem(field: FieldMeta, item: unknown): Record<string, unknown> | null {
  if (!isPlainObject(item)) return null;
  const declared = field.itemFields ?? [];
  const out: Record<string, unknown> = {};
  for (const sub of declared) {
    const raw = item[sub.name];
    if (isEmptyValue(raw)) continue;
    if (isVariableString(raw)) {
      out[sub.name] = raw;
      continue;
    }
    switch (sub.type) {
      case "number": {
        const n = coerceNumber(raw);
        if (n !== null) out[sub.name] = n;
        break;
      }
      case "boolean": {
        const b = coerceBoolean(raw);
        if (b !== null) out[sub.name] = b;
        break;
      }
      default:
        if (typeof raw === "string") out[sub.name] = raw;
        break;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** Sanitize ONE declared field's proposed value. Returns the kept value, or null → defer. */
function sanitizeFieldValue(field: FieldMeta, raw: unknown): unknown | null {
  if (isVariableString(raw)) return raw; // upstream reference — the patch pipeline validates it
  if (DEFERRED_TYPES.has(field.type)) return null;

  if (field.type === "number") return coerceNumber(raw);
  if (field.type === "boolean") return coerceBoolean(raw);

  if (field.type === "string-array") {
    const arr = coerceStringArray(raw);
    if (arr === null || arr.length === 0) return null;
    // Static options never coexist with string-array optionsSource values here; dynamic
    // (optionsSource) items are verified by the async resolver pass.
    return arr;
  }

  if (field.type === "select" || field.type === "combobox") {
    if (field.multiple === true) {
      const arr = coerceStringArray(raw);
      if (arr === null || arr.length === 0) return null;
      if (field.options && field.options.length > 0) {
        const mapped = arr.map((v) => matchStaticOption(field, v));
        return mapped.every((m): m is string => m !== null) ? mapped : null;
      }
      return arr; // dynamic — resolver pass verifies
    }
    if (typeof raw !== "string" || raw.trim() === "") return null;
    if (field.options && field.options.length > 0) return matchStaticOption(field, raw);
    return raw; // dynamic — resolver pass verifies
  }

  if (field.type === "keyvalue") {
    return isPlainObject(raw) ? raw : null;
  }

  if (field.type === "object") {
    return sanitizeItem(field, raw);
  }

  if (field.type === "object-list" || field.type === "keyvalue-list") {
    if (!Array.isArray(raw)) return null;
    if (field.type === "keyvalue-list") {
      const items = raw.filter(isPlainObject);
      return items.length === raw.length && items.length > 0 ? items : null;
    }
    const items = raw.map((i) => sanitizeItem(field, i));
    return items.every((i): i is Record<string, unknown> => i !== null) && items.length > 0 ? items : null;
  }

  if (field.type === "json") {
    return isPlainObject(raw) || Array.isArray(raw) || typeof raw === "string" ? raw : null;
  }

  if (STRING_TYPES.has(field.type)) {
    return typeof raw === "string" && raw.trim() !== "" ? raw : null;
  }

  return null; // unknown/unhandled type → defer, never guess
}

/**
 * Sanitize a proposed config record against a node's declared `FieldMeta[]`. The single per-node
 * primitive both the plan path and the edit path use.
 */
export function sanitizeConfigAgainstFields(
  proposed: Readonly<Record<string, unknown>>,
  fields: readonly FieldMeta[],
  /**
   * REACT-AGENT-MULTISTEP-DATA-MAPPING-1 — the user's own words, normalized by
   * `buildUserLiteralCorpus`. Any identity literal (email/phone) NOT found here was invented by the
   * model and is removed. Omitted ⇒ the guard is skipped entirely, so every existing caller and test
   * keeps its exact previous behavior; only callers that can prove what the user wrote opt in.
   */
  userCorpus?: string,
): SanitizedNodeConfig {
  const byName = new Map(fields.map((f) => [f.name, f]));
  const config: Record<string, unknown> = {};
  const deferredFields: string[] = [];
  const droppedFields: string[] = [];
  const fabricatedFields: string[] = [];

  for (const [key, raw] of Object.entries(proposed)) {
    const field = byName.get(key);
    if (!field) {
      droppedFields.push(key);
      continue;
    }
    if (field.sensitivity === "secret" || field.sensitivity === "connection") {
      droppedFields.push(key);
      continue;
    }
    if (isEmptyValue(raw)) continue; // empty means unset platform-wide — nothing to keep or defer
    // Invented identity data is checked BEFORE type coercion: a fabricated address is not a
    // "slightly wrong value to fix up", it is a value that must never reach a saved workflow.
    if (userCorpus !== undefined && findFabricatedValueDeep(raw, userCorpus) !== null) {
      fabricatedFields.push(key);
      continue;
    }
    const kept = sanitizeFieldValue(field, raw);
    if (kept === null) {
      deferredFields.push(key); // user constraint exists but is unusable → targeted input
    } else {
      config[key] = kept;
    }
  }

  return { config, deferredFields, droppedFields, fabricatedFields };
}

export interface SanitizePlanResult {
  readonly plan: WorkflowPlan;
  /** Safe, value-free notes (step ref + field keys) for logging/diagnostics. */
  readonly notes: readonly string[];
  /**
   * REACT-AGENT-MULTISTEP-DATA-MAPPING-1 — `{ stepRef, fieldKey }` pairs where an invented identity
   * literal was removed. Drives the specific rail warning; field KEYS only, never the value.
   */
  readonly fabricated: readonly { readonly ref: string; readonly field: string }[];
}

/** Look up the registry fields for a plan step, or null for logic/unknown capabilities. */
function fieldsForStep(step: WorkflowPlanStep): readonly FieldMeta[] | null {
  const key = `${step.provider}:${step.type}`;
  if (step.role === "trigger") return getTriggerMeta(key)?.fields ?? null;
  if (step.role === "action") return getActionMeta(key)?.fields ?? null;
  return null;
}

/**
 * Sanitize every step's proposed `config` against the real registry metadata. Deferred fields are
 * appended to the step's `requiredInputs` (deduplicated) so the constraint surfaces as a targeted
 * setup input instead of silently disappearing. Steps without config pass through unchanged.
 */
export function sanitizePlanStepConfigs(plan: WorkflowPlan, userCorpus?: string): SanitizePlanResult {
  const notes: string[] = [];
  const fabricated: { ref: string; field: string }[] = [];
  const steps = plan.steps.map((step) => {
    if (!step.config || Object.keys(step.config).length === 0) return step;
    const fields = fieldsForStep(step);
    if (!fields) {
      notes.push(`${step.ref}: config dropped (no registry metadata)`);
      const { config: _dropped, ...rest } = step;
      return rest as WorkflowPlanStep;
    }
    const { config, deferredFields, droppedFields, fabricatedFields } = sanitizeConfigAgainstFields(
      step.config,
      fields,
      userCorpus,
    );
    if (deferredFields.length > 0) notes.push(`${step.ref}: needs input for ${deferredFields.join(", ")}`);
    if (droppedFields.length > 0) notes.push(`${step.ref}: dropped ${droppedFields.join(", ")}`);
    if (fabricatedFields.length > 0) notes.push(`${step.ref}: removed invented value(s) for ${fabricatedFields.join(", ")}`);
    for (const field of fabricatedFields) fabricated.push({ ref: step.ref, field });
    // A removed invention still leaves the field NEEDED — it becomes a targeted setup input exactly
    // like any other unusable value, so the step is never silently left looking complete.
    const requiredInputs = [...new Set([...(step.requiredInputs ?? []), ...deferredFields, ...fabricatedFields])];
    const { config: _old, ...rest } = step;
    return {
      ...rest,
      ...(requiredInputs.length > 0 ? { requiredInputs } : {}),
      ...(Object.keys(config).length > 0 ? { config } : {}),
    } as WorkflowPlanStep;
  });
  return { plan: { ...plan, steps }, notes, fabricated };
}
