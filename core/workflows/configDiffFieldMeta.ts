import type { ActionMeta, FieldMeta } from "@/contracts/actionMeta";
import type { TriggerMeta } from "@/contracts/triggerMeta";
import { isSecretLikeKey } from "@/core/security/secretKeys";

/**
 * Display-safe per-field metadata for the React Agent config-diff review rail
 * (HERMES-AGENT-CONFIG-DIFF-REVIEW).
 *
 * The config-level diff needs, per `provider:type`, a field's author-facing
 * LABEL, whether it is REQUIRED, and whether it is SECRET (so the diff renders
 * "Changed" without ever showing the value). The single source of truth is the
 * action/trigger metadata in the discovery registry — never a parallel hardcoded
 * list. Mirrors the existing `buildRequiredFieldsByType` / `buildPreviewSetupFields`
 * server-computed-prop pattern: the server builds this once from the registry and
 * threads it into the builder as a static prop (a node type's fields never change),
 * and the client computes the value-level diff against the LIVE candidate config.
 *
 * A field is treated as SECRET when EITHER the metadata declares
 * `sensitivity: "secret" | "connection"` (credential / token / account-identity
 * material) OR the field KEY looks secret-shaped per the shared, client-safe
 * `isSecretLikeKey` classifier. This is the same redaction basis the AI tooling
 * uses, so the review rail can never surface a value the rest of the app redacts.
 * `recipient` sensitivity is NOT secret — a recipient is a deterministic
 * "where to send" value the user picks, safe to show in a diff.
 *
 * `core/` rule: imports only `contracts/` + the client-safe `core/security`
 * classifier. Pure — no React, no fetch, no services, no repositories, no I/O.
 */

/** One field's display-safe metadata for the config diff. */
export interface ConfigDiffFieldMeta {
  readonly name: string;
  readonly label: string;
  readonly required: boolean;
  /**
   * True when the metadata declares a `defaultValue`. A required field WITH a
   * default is satisfiable without explicit input, so it is NEVER a readiness
   * gap — mirrors `NodeTypeRequirement.hasDefault` so the review rail's
   * "missing required" matches the builder readiness gate exactly.
   */
  readonly hasDefault: boolean;
  /** True when the value must be redacted (never shown) in the diff. */
  readonly secret: boolean;
}

/** Per-node-type config-diff metadata, keyed by `provider:type` (== meta.key). */
export interface ConfigDiffNodeTypeMeta {
  readonly displayName: string;
  /** Field metadata keyed by field name for O(1) lookup during diffing. */
  readonly fields: Readonly<Record<string, ConfigDiffFieldMeta>>;
}

/** `provider:type` → its config-diff metadata. */
export type ConfigDiffFieldMetaByType = Readonly<
  Record<string, ConfigDiffNodeTypeMeta>
>;

/** A field is secret when metadata declares it OR its key name looks secret-shaped. */
function isSecretField(field: FieldMeta): boolean {
  if (field.sensitivity === "secret" || field.sensitivity === "connection") {
    return true;
  }
  return isSecretLikeKey(field.name);
}

function toConfigDiffFieldMeta(field: FieldMeta): ConfigDiffFieldMeta {
  return {
    name: field.name,
    label: field.label,
    required: field.required,
    hasDefault: field.defaultValue !== undefined,
    secret: isSecretField(field),
  };
}

/**
 * Derive the config-diff metadata lookup from action/trigger metadata. Pure: the
 * server sources the meta lists from the discovery registry and emits a
 * `provider:type` → metadata map for the builder to diff the live config against.
 */
export function buildConfigDiffFieldMeta(
  actionMetas: readonly ActionMeta[],
  triggerMetas: readonly TriggerMeta[],
): ConfigDiffFieldMetaByType {
  const out: Record<string, ConfigDiffNodeTypeMeta> = {};
  for (const meta of [...actionMetas, ...triggerMetas]) {
    const fields: Record<string, ConfigDiffFieldMeta> = {};
    for (const field of meta.fields) {
      fields[field.name] = toConfigDiffFieldMeta(field);
    }
    out[meta.key] = { displayName: meta.displayName, fields };
  }
  return out;
}
