/**
 * CURRENT-DRAFT → model-facing EDITABLE GRAPH builder (HERMES-AGENT-WORKFLOW-EDITOR-LIVE).
 *
 * THE EDITOR PRIVACY BOUNDARY. Converts the user's real local `WorkflowDefinition` into the
 * {@link EditableWorkflowGraph} the conversational-editor model is allowed to see, plus a PRIVATE
 * `refMap` (opaque ref → real node id) the server keeps to materialize real ids back. This is a
 * SEPARATE contract from `sanitizeWorkflowForGuidance` (which de-identifies for NEW-workflow design and
 * forwards NO config at all) — repurposing that one risked widening what it exposes, so the editor gets
 * its own purpose-built, narrowly-scoped surface.
 *
 * Allow-list / redaction policy (the enforcement the no-leak test pins):
 *   1. Nodes become opaque refs `node_1..node_N` (array order). The real id is kept ONLY in `refMap`.
 *   2. Node `displayName` (user text) is NEVER read. The safe `description` is the CATALOG display name.
 *   3. Config fields are surfaced ONLY when DECLARED in the node's registry meta — undeclared / hidden /
 *      internal config keys never appear. Declared fields with `sensitivity` of `secret` or
 *      `connection` (tokens, credentials, account/connection selectors) are dropped ENTIRELY.
 *   4. A field's current VALUE is echoed ONLY for low-risk primitive/enum types (boolean, number,
 *      static-option select/combobox, cron + date/time family). Free text, textarea, recipients,
 *      channels, key-value, files, string-arrays, locations, and multi-selects surface key/label/type +
 *      an `isSet` presence flag with NO value — enough to resolve "change the recipient" / "change this
 *      channel" without leaking the current text/PII.
 *   5. Any echoed string that contains a `{{…}}` variable token (would leak a real node id) or matches a
 *      secret shape is dropped to presence-only. Defense in depth via `redactSecretsFromText`.
 *
 * Pure + non-mutating + model-free. The graph carries the deterministic `version` digest so a later
 * proposal can be rejected as stale.
 */

import type { WorkflowDefinition, WorkflowNode } from "@/contracts/workflowDefinition";
import type { FieldMeta } from "@/contracts/actionMeta";
import {
  EDITABLE_GRAPH_SCHEMA_VERSION,
  EXISTING_EDGE_REF_PREFIX,
  EXISTING_NODE_REF_PREFIX,
  type EditableGraphConfigField,
  type EditableGraphEdge,
  type EditableGraphNode,
  type EditableWorkflowGraph,
} from "@/contracts/editableWorkflowGraph";
import { getActionMeta, getTriggerMeta } from "@/services/discovery/_registry";
import { computeEditableGraphVersion } from "@/core/workflows/editableGraphVersion";
import { redactSecretsFromText } from "../gateway/buildGatewayGuidancePrompt";

export interface BuiltEditableWorkflowGraph {
  /** The SAFE, model-facing editable graph (crosses the boundary). */
  readonly graph: EditableWorkflowGraph;
  /** INTERNAL ONLY: opaque node ref → real node id. NEVER sent to the model / logged. */
  readonly refMap: ReadonlyMap<string, string>;
  /** INTERNAL ONLY: opaque edge ref → real edge id. NEVER sent to the model / logged. */
  readonly edgeRefMap: ReadonlyMap<string, string>;
  /** The deterministic draft digest (also on `graph.version`) — convenience for the route's stale guard. */
  readonly version: string;
}

/** Field types whose VALUE is low-risk to echo (no PII / no resource id / no secret shape). */
const VALUE_SAFE_TYPES: ReadonlySet<string> = new Set([
  "boolean",
  "number",
  "cron",
  "date",
  "time",
  "datetime",
  "datetime-utc",
  "timezone",
]);

/** Is a config value "set" (present + non-empty)? Mirrors the needs-setup emptiness check. */
function isValuePresent(v: unknown): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v === "string") return v.trim() !== "";
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

/** Echo a field's value ONLY when its type + shape are safe; otherwise undefined (presence-only). */
function safeFieldValue(field: FieldMeta, raw: unknown): string | number | boolean | undefined {
  if (!isValuePresent(raw)) return undefined;
  // Static-option select/combobox (single) → the value is a known catalog enum, safe to echo.
  const isStaticEnum =
    (field.type === "select" || field.type === "combobox") &&
    !field.multiple &&
    Array.isArray(field.options) &&
    typeof raw === "string" &&
    field.options.some((o) => o.value === raw);
  if (isStaticEnum) return raw as string;

  if (!VALUE_SAFE_TYPES.has(field.type)) return undefined;
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    // A variable token would leak a real node id; a secret-shaped string must never echo.
    if (raw.includes("{{") || raw.includes("}}")) return undefined;
    const redacted = redactSecretsFromText(raw);
    if (redacted !== raw) return undefined;
    return raw.slice(0, 200);
  }
  return undefined;
}

/** Build the safe editable config field list for a node from its registry meta (allow-list). */
function buildConfigFields(node: WorkflowNode): { fields: EditableGraphConfigField[]; description?: string } {
  const key = `${node.provider}:${node.type}`;
  const meta = node.kind === "trigger" ? getTriggerMeta(key) : getActionMeta(key);
  if (!meta) return { fields: [] };
  const fields: EditableGraphConfigField[] = [];
  for (const field of meta.fields) {
    // Drop credential / connection-identity fields wholesale — never surfaced, value or not.
    if (field.sensitivity === "secret" || field.sensitivity === "connection") continue;
    const raw = node.config[field.name];
    const value = safeFieldValue(field, raw);
    fields.push({
      key: field.name,
      label: field.label,
      type: field.type,
      required: field.required,
      isSet: isValuePresent(raw),
      ...(value !== undefined ? { value } : {}),
    });
  }
  return { fields, description: meta.displayName };
}

/** Build the model-facing editable graph + the private ref→realId map. Pure. */
export function buildEditableWorkflowGraph(def: WorkflowDefinition): BuiltEditableWorkflowGraph {
  const nodes = Array.isArray(def?.nodes) ? def.nodes : [];
  const edges = Array.isArray(def?.edges) ? def.edges : [];

  const idToRef = new Map<string, string>();
  const refMap = new Map<string, string>();

  const graphNodes: EditableGraphNode[] = nodes.map((n, i) => {
    const ref = `${EXISTING_NODE_REF_PREFIX}${i + 1}`;
    idToRef.set(n.id, ref);
    refMap.set(ref, n.id);
    const { fields, description } = buildConfigFields(n);
    const role: EditableGraphNode["role"] = n.kind === "trigger" ? "trigger" : "action";
    return {
      ref,
      role,
      kind: n.kind,
      provider: typeof n.provider === "string" ? n.provider : "",
      type: typeof n.type === "string" ? n.type : "",
      capabilityKey: `${n.provider}:${n.type}`,
      ...(description ? { description } : {}),
      config: fields,
    };
  });

  const edgeRefMap = new Map<string, string>();
  let edgeCounter = 0;
  const graphEdges: EditableGraphEdge[] = edges
    .map((e) => {
      const fromRef = idToRef.get(e.from);
      const toRef = idToRef.get(e.to);
      if (!fromRef || !toRef) return null;
      const ref = `${EXISTING_EDGE_REF_PREFIX}${++edgeCounter}`;
      edgeRefMap.set(ref, e.id);
      return { ref, fromRef, toRef, ...(e.label ? { label: e.label } : {}) };
    })
    .filter((e): e is EditableGraphEdge => e !== null);

  const version = computeEditableGraphVersion(def);

  const graph: EditableWorkflowGraph = {
    schemaVersion: EDITABLE_GRAPH_SCHEMA_VERSION,
    version,
    nodeCount: graphNodes.length,
    edgeCount: graphEdges.length,
    nodes: graphNodes,
    edges: graphEdges,
  };

  return { graph, refMap, edgeRefMap, version };
}
