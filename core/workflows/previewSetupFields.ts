import type { ActionMeta, FieldMeta } from "@/contracts/actionMeta";
import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Guided-preview setup fields (HERMES-AGENT-GUIDED-PREVIEW-SETUP-1 / -RAIL-UX).
 *
 * A deterministic, metadata-derived subset of a node type's fields that ChainReact can collect with a
 * SIMPLE LOCAL control while the proposed node is still a holographic preview (before Apply). The
 * source of truth is the action/trigger metadata (`FieldMeta`) — NEVER Hermes prose. Collected values
 * live ONLY in ephemeral preview state and are seeded into the new draft node on explicit Apply; they
 * are NEVER sent to Hermes / a model / a prompt / audit text. This collection is intentionally
 * conservative:
 *
 *   - Supported control types only: `text`, `textarea`, `number`, `boolean`, and `select` ONLY when it
 *     has STATIC `options` (no async resolver). Everything else (combobox, keyvalue, file, cron,
 *     router-routes, string-array, file-array, dynamic select) is deferred.
 *   - `recipient`-class fields ARE allowed when they render as one of the supported LOCAL control types
 *     (HERMES-AGENT-GUIDED-PREVIEW-SETUP-RAIL-UX). A recipient is "where a message/event is sent" — a
 *     deterministic value the user types/picks locally; it is seeded into draft config on Apply and is
 *     NEVER sent to Hermes. (The apply-safety contract still guards AI auto-writes to recipients
 *     separately; this is explicit user input, not an AI write.)
 *   - EXCLUDED entirely: `secret` / `connection` sensitivity (credential/token/account-identity
 *     material), an `optionsSource` (async provider resolver — the rail shows a "choose after Apply"
 *     deferred state instead), a `dependsOn` cascade, or `multiple`. These are never rendered or
 *     seeded pre-apply.
 *
 * `core/` may be imported by both the client (builder) and the server (page metadata build), and
 * imports only `contracts/`. Pure: no state, no fetch, no model call.
 */

export type PreviewSetupFieldType = "text" | "textarea" | "number" | "boolean" | "select";

export interface PreviewSetupFieldOption {
  readonly value: string;
  readonly label: string;
}

/** One field collectable via a simple local control on the holographic preview. Metadata-sourced. */
export interface PreviewSetupField {
  readonly name: string;
  readonly label: string;
  readonly type: PreviewSetupFieldType;
  readonly required: boolean;
  readonly placeholder?: string;
  /** Static options — present only for `select`. */
  readonly options?: readonly PreviewSetupFieldOption[];
}

/** `provider:type` (== meta.key) → its supported preview-setup fields. */
export type PreviewSetupFieldsByType = Readonly<Record<string, readonly PreviewSetupField[]>>;

/** Map one `FieldMeta` to a supported `PreviewSetupField`, or `null` when not safely supported here. */
function toPreviewSetupField(f: FieldMeta): PreviewSetupField | null {
  // Never collect credential/token/account-identity material before Apply. `recipient` IS allowed
  // (it's a deterministic, locally-entered "where to send" value, seeded on Apply, never sent to
  // Hermes) — only `secret` / `connection` stay excluded.
  if (f.sensitivity === "secret" || f.sensitivity === "connection") return null;
  // Async resolver dropdowns are deferred — the rail shows a "choose after Apply" state, no network.
  if (f.optionsSource !== undefined) return null;
  // Cascading + multi-value fields are deferred.
  if (f.dependsOn !== undefined) return null;
  if (f.multiple === true) return null;

  const base = {
    name: f.name,
    label: f.label,
    required: f.required,
    ...(f.placeholder !== undefined ? { placeholder: f.placeholder } : {}),
  };
  switch (f.type) {
    case "text":
    case "textarea":
    case "number":
    case "boolean":
      return { ...base, type: f.type };
    case "select":
      // Static options only; a dynamic select (no static `options`) is deferred.
      if (f.options && f.options.length > 0) {
        return { ...base, type: "select", options: f.options.map((o) => ({ value: o.value, label: o.label })) };
      }
      return null;
    default:
      return null;
  }
}

/** Derive the supported preview-setup fields per `provider:type` from action/trigger metadata. */
export function buildPreviewSetupFields(
  actionMetas: readonly ActionMeta[],
  triggerMetas: readonly TriggerMeta[],
): PreviewSetupFieldsByType {
  const out: Record<string, readonly PreviewSetupField[]> = {};
  for (const meta of [...actionMetas, ...triggerMetas]) {
    const fields = meta.fields
      .map(toPreviewSetupField)
      .filter((f): f is PreviewSetupField => f !== null);
    if (fields.length > 0) out[meta.key] = fields;
  }
  return out;
}

/**
 * Sanitize user-entered preview values into a seedable config for a node type. ONLY keys present in
 * `fields` (the supported, non-sensitive set) are kept — unknown / secret / async keys are dropped.
 * Values are type-coerced and empties dropped. Pure.
 */
export function sanitizeSeedConfig(
  raw: Readonly<Record<string, unknown>> | undefined,
  fields: readonly PreviewSetupField[] | undefined,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!raw || !fields) return out;
  for (const f of fields) {
    if (!(f.name in raw)) continue;
    const v = raw[f.name];
    if (v === undefined || v === null || v === "") continue;
    if (f.type === "number") {
      const n = typeof v === "number" ? v : Number(v);
      if (Number.isFinite(n)) out[f.name] = n;
    } else if (f.type === "boolean") {
      out[f.name] = Boolean(v);
    } else if (f.type === "select") {
      // Keep only a value that matches the static options.
      if (typeof v === "string" && (!f.options || f.options.some((o) => o.value === v))) out[f.name] = v;
    } else if (typeof v === "string") {
      // text / textarea
      out[f.name] = v;
    }
  }
  return out;
}
