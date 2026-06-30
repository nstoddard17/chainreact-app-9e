import type { WorkflowNode } from "@/contracts/workflow";
import {
  isRequiredValueMissing,
  requirementLookupKey,
} from "@/core/workflows/requiredFields";
import { parseReferences } from "@/core/workflows/variableReferences";
import type {
  ConfigDiffFieldMeta,
  ConfigDiffFieldMetaByType,
  ConfigDiffNodeTypeMeta,
} from "@/core/workflows/configDiffFieldMeta";
import { isSecretLikeKey } from "@/core/security/secretKeys";

/**
 * Pure config-level diff for the React Agent preview review rail
 * (HERMES-AGENT-CONFIG-DIFF-REVIEW).
 *
 * The canvas already shows the STRUCTURAL node diff (added/removed/changed/
 * unchanged) via `features/workflow-builder/utils/buildPreviewDiffGraph.ts`. This
 * is its VALUE-level companion: for every added/changed/removed node it reports
 * the field-level changes (added / changed before→after / removed), the still-
 * missing required fields, and the `{{...}}` variables the config references — the
 * detail the right rail owns so the user never has to open each node.
 *
 * It shares the SAME node-pairing + status rules as `buildPreviewDiffGraph` (a
 * `provider:type` swap is a removed+added replacement, never an in-place change;
 * status is decided on canonicalized config equality), so the canvas and the rail
 * can never disagree about which nodes changed. A parity test pins this.
 *
 * No-leak contract: the inputs are the user's OWN draft + the agent's proposed
 * end-state (both already client-side). Secret-shaped fields (metadata
 * `sensitivity: secret/connection` OR a secret-shaped key name) are rendered as
 * "Changed" with NO value — the raw value never enters the result. Internal
 * (`_`-prefixed) keys are dropped. Object/array values are summarized, never
 * dumped as JSON. `0` / `false` / `""` are explicit values, never "missing" (Q5).
 *
 * `core/` rule: imports only `contracts/` + client-safe `core/` helpers. Pure —
 * no React, no fetch, no services, no repositories, no I/O.
 */

export type NodeConfigDiffStatus = "added" | "changed" | "removed";

/** A redacted/summarized display form of one config value — never raw JSON, never a secret. */
export type ConfigDiffValue =
  | { readonly kind: "redacted" }
  | { readonly kind: "empty" }
  | { readonly kind: "scalar"; readonly value: number | boolean }
  | { readonly kind: "text"; readonly preview: string; readonly truncated: boolean }
  | { readonly kind: "summary"; readonly summary: string };

/** One field-level change within a node. `before`/`after` present per change kind. */
export interface ConfigFieldChange {
  readonly name: string;
  readonly label: string;
  readonly secret: boolean;
  /** Present for `changed` + `removed` (the prior value). */
  readonly before?: ConfigDiffValue;
  /** Present for `changed` + `added` (the proposed value). */
  readonly after?: ConfigDiffValue;
}

export interface MissingRequiredField {
  readonly name: string;
  readonly label: string;
}

export interface NodeConfigDiff {
  readonly nodeId: string;
  readonly provider: string;
  readonly type: string;
  /** Author-facing label: node displayName → metadata displayName → `provider:type`. */
  readonly label: string;
  readonly status: NodeConfigDiffStatus;
  readonly addedFields: readonly ConfigFieldChange[];
  readonly changedFields: readonly ConfigFieldChange[];
  readonly removedFields: readonly ConfigFieldChange[];
  /** Required fields still empty on an added/changed node (never on removed). */
  readonly missingRequiredFields: readonly MissingRequiredField[];
  /** Unique `{{...}}` tokens referenced by this node's (non-secret) config values. */
  readonly variablesUsed: readonly string[];
}

export interface ConfigDiff {
  readonly nodes: readonly NodeConfigDiff[];
}

interface GraphLike {
  readonly nodes: readonly WorkflowNode[];
}

export interface BuildConfigDiffInput {
  readonly current: GraphLike;
  readonly candidate: GraphLike;
  readonly fieldMetaByType?: ConfigDiffFieldMetaByType;
}

/** Max characters shown inline for a string value before it is truncated with an expand hint. */
const TEXT_PREVIEW_LIMIT = 120;

/** Stable, key-order-independent serialization for change detection (mirrors buildPreviewDiffGraph). */
function canonicalConfig(config: Record<string, unknown> | undefined): string {
  return JSON.stringify(canonicalize(config ?? {}));
}
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(obj).sort()) out[k] = canonicalize(obj[k]);
    return out;
  }
  return value;
}

/** Internal/hidden config keys are never surfaced in the diff. */
function isHiddenInternalKey(key: string): boolean {
  return key.startsWith("_");
}

/** A value is "set" exactly per the shared required-field rule: 0/false set, undefined/null/""/[] not. */
function isSet(value: unknown): boolean {
  return !isRequiredValueMissing(value);
}

function typeMetaFor(
  node: WorkflowNode,
  fieldMetaByType: ConfigDiffFieldMetaByType | undefined,
): ConfigDiffNodeTypeMeta | undefined {
  return fieldMetaByType?.[requirementLookupKey(node)];
}

function fieldMetaFor(
  typeMeta: ConfigDiffNodeTypeMeta | undefined,
  key: string,
): ConfigDiffFieldMeta | undefined {
  return typeMeta?.fields[key];
}

function labelFor(node: WorkflowNode, typeMeta: ConfigDiffNodeTypeMeta | undefined): string {
  return node.displayName ?? typeMeta?.displayName ?? `${node.provider}:${node.type}`;
}

/** A field is secret per metadata OR a secret-shaped key name (keys outside metadata). */
function isSecretKey(meta: ConfigDiffFieldMeta | undefined, key: string): boolean {
  return meta?.secret ?? isSecretLikeKey(key);
}

/** Build the redacted/summarized display form of one config value. Never returns a raw secret. */
function toDiffValue(value: unknown, secret: boolean): ConfigDiffValue {
  if (secret) return { kind: "redacted" };
  if (value === undefined || value === null) return { kind: "empty" };
  if (typeof value === "string") {
    if (value === "") return { kind: "empty" };
    return value.length > TEXT_PREVIEW_LIMIT
      ? { kind: "text", preview: value.slice(0, TEXT_PREVIEW_LIMIT), truncated: true }
      : { kind: "text", preview: value, truncated: false };
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return { kind: "scalar", value };
  }
  if (Array.isArray(value)) {
    const n = value.length;
    return { kind: "summary", summary: `${n} item${n === 1 ? "" : "s"}` };
  }
  return { kind: "summary", summary: "advanced value" };
}

/** Recursively collect unique `{{nodeId.path}}` tokens from a node's non-secret config values. */
function collectVariables(
  config: Record<string, unknown> | undefined,
  typeMeta: ConfigDiffNodeTypeMeta | undefined,
): readonly string[] {
  const tokens = new Set<string>();
  const visit = (value: unknown): void => {
    if (typeof value === "string") {
      for (const ref of parseReferences(value)) tokens.add(ref.token);
    } else if (Array.isArray(value)) {
      for (const item of value) visit(item);
    } else if (value && typeof value === "object") {
      for (const v of Object.values(value as Record<string, unknown>)) visit(v);
    }
  };
  for (const [key, value] of Object.entries(config ?? {})) {
    if (isHiddenInternalKey(key)) continue;
    if (isSecretKey(fieldMetaFor(typeMeta, key), key)) continue; // never parse secret values
    visit(value);
  }
  return [...tokens];
}

/** Required fields still empty on a node's config (skips defaulted fields, mirrors readiness gate). */
function missingRequired(
  config: Record<string, unknown> | undefined,
  typeMeta: ConfigDiffNodeTypeMeta | undefined,
): readonly MissingRequiredField[] {
  if (!typeMeta) return [];
  const out: MissingRequiredField[] = [];
  for (const field of Object.values(typeMeta.fields)) {
    if (!field.required || field.hasDefault) continue;
    if (isRequiredValueMissing((config ?? {})[field.name])) {
      out.push({ name: field.name, label: field.label });
    }
  }
  return out;
}

function makeFieldChange(
  key: string,
  typeMeta: ConfigDiffNodeTypeMeta | undefined,
  opts: { before?: unknown; after?: unknown; hasBefore: boolean; hasAfter: boolean },
): ConfigFieldChange {
  const meta = fieldMetaFor(typeMeta, key);
  const secret = isSecretKey(meta, key);
  return {
    name: key,
    label: meta?.label ?? key,
    secret,
    ...(opts.hasBefore ? { before: toDiffValue(opts.before, secret) } : {}),
    ...(opts.hasAfter ? { after: toDiffValue(opts.after, secret) } : {}),
  };
}

/** Diff one added node: every set config field is an "added field". */
function diffAddedNode(
  node: WorkflowNode,
  fieldMetaByType: ConfigDiffFieldMetaByType | undefined,
): NodeConfigDiff {
  const typeMeta = typeMetaFor(node, fieldMetaByType);
  const config = node.config ?? {};
  const addedFields: ConfigFieldChange[] = [];
  for (const [key, value] of Object.entries(config)) {
    if (isHiddenInternalKey(key) || !isSet(value)) continue;
    addedFields.push(makeFieldChange(key, typeMeta, { after: value, hasAfter: true, hasBefore: false }));
  }
  return {
    nodeId: node.id,
    provider: node.provider,
    type: node.type,
    label: labelFor(node, typeMeta),
    status: "added",
    addedFields,
    changedFields: [],
    removedFields: [],
    missingRequiredFields: missingRequired(config, typeMeta),
    variablesUsed: collectVariables(config, typeMeta),
  };
}

/** Diff one removed node: every set config field is a "removed field" (redacted as needed). */
function diffRemovedNode(
  node: WorkflowNode,
  fieldMetaByType: ConfigDiffFieldMetaByType | undefined,
): NodeConfigDiff {
  const typeMeta = typeMetaFor(node, fieldMetaByType);
  const config = node.config ?? {};
  const removedFields: ConfigFieldChange[] = [];
  for (const [key, value] of Object.entries(config)) {
    if (isHiddenInternalKey(key) || !isSet(value)) continue;
    removedFields.push(makeFieldChange(key, typeMeta, { before: value, hasBefore: true, hasAfter: false }));
  }
  return {
    nodeId: node.id,
    provider: node.provider,
    type: node.type,
    label: labelFor(node, typeMeta),
    status: "removed",
    addedFields: [],
    changedFields: [],
    removedFields,
    missingRequiredFields: [],
    variablesUsed: collectVariables(config, typeMeta),
  };
}

/** Diff one changed node: per-field added / changed (before→after) / removed. */
function diffChangedNode(
  current: WorkflowNode,
  candidate: WorkflowNode,
  fieldMetaByType: ConfigDiffFieldMetaByType | undefined,
): NodeConfigDiff {
  const typeMeta = typeMetaFor(candidate, fieldMetaByType);
  const before = current.config ?? {};
  const after = candidate.config ?? {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const added: ConfigFieldChange[] = [];
  const changed: ConfigFieldChange[] = [];
  const removed: ConfigFieldChange[] = [];
  for (const key of keys) {
    if (isHiddenInternalKey(key)) continue;
    const beforeSet = isSet(before[key]);
    const afterSet = isSet(after[key]);
    if (!beforeSet && afterSet) {
      added.push(makeFieldChange(key, typeMeta, { after: after[key], hasAfter: true, hasBefore: false }));
    } else if (beforeSet && !afterSet) {
      removed.push(makeFieldChange(key, typeMeta, { before: before[key], hasBefore: true, hasAfter: false }));
    } else if (beforeSet && afterSet) {
      if (JSON.stringify(canonicalize(before[key])) !== JSON.stringify(canonicalize(after[key]))) {
        changed.push(
          makeFieldChange(key, typeMeta, {
            before: before[key],
            after: after[key],
            hasBefore: true,
            hasAfter: true,
          }),
        );
      }
    }
    // both not-set → no meaningful change (handles "" vs undefined gracefully).
  }
  return {
    nodeId: candidate.id,
    provider: candidate.provider,
    type: candidate.type,
    label: labelFor(candidate, typeMeta),
    status: "changed",
    addedFields: added,
    changedFields: changed,
    removedFields: removed,
    missingRequiredFields: missingRequired(after, typeMeta),
    variablesUsed: collectVariables(after, typeMeta),
  };
}

/**
 * Compose the value-level config diff from the current draft and the proposed
 * candidate. Returns only nodes that were added, changed, or removed (unchanged
 * nodes are omitted). Reading order: candidate order (added/changed), then
 * removed nodes in current order.
 */
export function buildConfigDiff(input: BuildConfigDiffInput): ConfigDiff {
  const currentNodes = input.current.nodes ?? [];
  const candidateNodes = input.candidate.nodes ?? [];
  const currentById = new Map(currentNodes.map((n) => [n.id, n]));
  const candidateById = new Map(candidateNodes.map((n) => [n.id, n]));

  const result: NodeConfigDiff[] = [];

  for (const candidate of candidateNodes) {
    const current = currentById.get(candidate.id);
    if (!current) {
      result.push(diffAddedNode(candidate, input.fieldMetaByType));
      continue;
    }
    // A provider:type swap that reuses an id is a REPLACEMENT (removed + added),
    // never an in-place change — same rule as buildPreviewDiffGraph.
    if (current.provider !== candidate.provider || current.type !== candidate.type) {
      result.push(diffAddedNode(candidate, input.fieldMetaByType));
      continue;
    }
    if (canonicalConfig(current.config) !== canonicalConfig(candidate.config)) {
      result.push(diffChangedNode(current, candidate, input.fieldMetaByType));
    }
    // identical config → unchanged → omit
  }

  for (const current of currentNodes) {
    const candidate = candidateById.get(current.id);
    // Removed when the id is gone, OR replaced by a different provider:type (swap).
    if (!candidate || current.provider !== candidate.provider || current.type !== candidate.type) {
      result.push(diffRemovedNode(current, input.fieldMetaByType));
    }
  }

  return { nodes: result };
}
