import type { WorkflowDefinition } from "@/contracts/workflowDefinition";
import type { WorkflowRecord } from "@/repositories/workflows";

/**
 * Credential-free workflow schema export (Slice 4.PLATFORM-BILLING-BUSINESS-DOWNGRADE-3 /
 * CS-BD-4A).
 *
 * Produces a SHAREABLE, credential-free snapshot of a workflow's graph so a user can save their
 * work before a destructive Business → Team downgrade (and, later, re-import it). Export/import is
 * net-new in V2; this slice ships ONLY the export foundation + sanitizer (no import yet, not wired
 * to the downgrade UI yet).
 *
 * NO-LEAK CONTRACT — the export must NEVER contain:
 *   - OAuth tokens / bearer tokens / API keys / client secrets / signing or webhook secrets /
 *     passwords (these are never in `draft_definition` anyway — tokens live encrypted in
 *     `integrations` — but node `config` is an opaque record and could carry one, so we redact);
 *   - provider account labels / emails / connected-account ids;
 *   - credential-owner user ids / `connected_by_user_id` / `workflow_node_credentials` data
 *     (none of which live in the definition — they are separate tables — so they are structurally
 *     excluded by building the export from name + sanitized definition only);
 *   - Stripe ids, account ids, user ids.
 *
 * Structural safety: the export is assembled from the workflow NAME + the SANITIZED definition
 * only. Sensitive sibling tables (integrations, node-credential grants) are never read, so they
 * cannot leak. The single residual surface is the opaque per-node `config`, handled by
 * {@link sanitizeWorkflowDefinitionForExport} below.
 *
 * Redaction marker: a stripped value becomes the {@link REDACTION_MARKER} sentinel so a future
 * import can prompt the user to reconnect/reselect that field (it does not silently drop it).
 */

export const EXPORT_SCHEMA_VERSION = 1;
export const EXPORT_SOURCE = "chainreactv2";
export const REDACTION_MARKER = "__REDACTED__";

/**
 * Config KEY names whose VALUE is always redacted wholesale (case-insensitive substring match) —
 * tokens, secrets, credentials, and account/owner identifiers that must never travel in a
 * shareable export.
 */
const SENSITIVE_KEY_RE =
  /(token|secret|password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|credential|oauth|private[_-]?key|signing[_-]?secret|webhook[_-]?secret|bearer|authorization|connected[_-]?by|owner[_-]?user[_-]?id|credential[_-]?owner|integration[_-]?id|account[_-]?label|provider[_-]?account[_-]?id)/i;

/** Email-like substrings — redacted inside ANY string value (PII / account-identifying). */
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

/**
 * Token-like substrings — redacted inside ANY string value even when the key looks innocuous
 * (defense in depth for a secret pasted into a free-text field). Covers common provider token
 * shapes + JWTs.
 */
const TOKEN_RE =
  /(xox[baprs]-[A-Za-z0-9-]{6,}|sk_[A-Za-z0-9]{8,}|pk_[A-Za-z0-9]{8,}|rk_[A-Za-z0-9]{8,}|ya29\.[A-Za-z0-9._-]{8,}|gh[pousr]_[A-Za-z0-9]{8,}|whsec_[A-Za-z0-9]{8,}|AIza[A-Za-z0-9_-]{10,}|Bearer\s+[A-Za-z0-9._-]{8,}|eyJ[A-Za-z0-9._-]{12,})/g;

function redactString(value: string): string {
  return value.replace(EMAIL_RE, REDACTION_MARKER).replace(TOKEN_RE, REDACTION_MARKER);
}

/**
 * Recursively sanitize an opaque config value. `keyIsSensitive` is true when the value sits under
 * a sensitive key — the whole value is then replaced with the marker. Otherwise: strings get
 * email/token substrings redacted; objects/arrays recurse (objects re-evaluate key-sensitivity per
 * key); primitives pass through.
 */
function sanitizeValue(value: unknown, keyIsSensitive: boolean): unknown {
  if (keyIsSensitive && value !== null && value !== undefined) {
    return REDACTION_MARKER;
  }
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) return value.map((v) => sanitizeValue(v, false));
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = sanitizeValue(v, SENSITIVE_KEY_RE.test(k));
    }
    return out;
  }
  return value; // number | boolean | null | undefined
}

/** Sanitize a node `config` record for export (top-level keys evaluated for sensitivity). */
export function sanitizeConfigForExport(
  config: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(config)) {
    out[k] = sanitizeValue(v, SENSITIVE_KEY_RE.test(k));
  }
  return out;
}

export interface ExportedWorkflowNode {
  id: string;
  kind: string;
  provider: string;
  type: string;
  displayName?: string;
  position: { x: number; y: number };
  config: Record<string, unknown>;
}

export interface ExportedWorkflowEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
}

export interface ExportedWorkflowDefinition {
  nodes: ExportedWorkflowNode[];
  edges: ExportedWorkflowEdge[];
}

/**
 * Sanitize a full workflow definition for export. Node/edge fields are WHITELISTED (any unexpected
 * field on a node/edge is dropped — defense against future fields that might carry identity), and
 * each node's opaque `config` is run through {@link sanitizeConfigForExport}.
 */
export function sanitizeWorkflowDefinitionForExport(
  definition: WorkflowDefinition,
): ExportedWorkflowDefinition {
  return {
    nodes: (definition.nodes ?? []).map((n) => ({
      id: n.id,
      kind: n.kind,
      provider: n.provider,
      type: n.type,
      ...(n.displayName != null ? { displayName: n.displayName } : {}),
      position: { x: n.position?.x ?? 0, y: n.position?.y ?? 0 },
      config: sanitizeConfigForExport(n.config ?? {}),
    })),
    edges: (definition.edges ?? []).map((e) => ({
      id: e.id,
      from: e.from,
      to: e.to,
      ...(e.label != null ? { label: e.label } : {}),
    })),
  };
}

export interface WorkflowExport {
  source: typeof EXPORT_SOURCE;
  schemaVersion: typeof EXPORT_SCHEMA_VERSION;
  exportedAt: string;
  /** The sentinel used for redacted (reconnect-required) values, so import can detect them. */
  redactionMarker: typeof REDACTION_MARKER;
  workflow: {
    name: string;
    definition: ExportedWorkflowDefinition;
  };
}

/**
 * Build the credential-free export DTO from a workflow record. Pure — `nowIso` is injected so the
 * function stays deterministic (the route passes `new Date().toISOString()`). Reads ONLY the
 * record's `name` + `draftDefinition`; no integrations / credentials / ids of any kind.
 */
export function buildWorkflowExport(record: WorkflowRecord, nowIso: string): WorkflowExport {
  return {
    source: EXPORT_SOURCE,
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: nowIso,
    redactionMarker: REDACTION_MARKER,
    workflow: {
      name: record.name,
      definition: sanitizeWorkflowDefinitionForExport(record.draftDefinition),
    },
  };
}
