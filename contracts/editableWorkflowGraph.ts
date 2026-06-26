/**
 * Model-facing EDITABLE WORKFLOW GRAPH contract (HERMES-AGENT-WORKFLOW-EDITOR-LIVE).
 *
 * A DEDICATED, SEPARATE boundary from `sanitizeWorkflowForGuidance` (the generalized-workflow privacy
 * contract used for NEW-workflow design). This one exists for ONE job: give the conversational editor
 * model a SAFE, STABLE, opaque view of the user's CURRENT local draft so it can resolve references
 * ("change it", "remove that Slack step") and propose `WorkflowPatch` operations against it — WITHOUT
 * ever seeing real ids, credentials, or secret config.
 *
 * What CROSSES the boundary (per node):
 *   - `ref`           — an OPAQUE, stable, per-request node reference (`node_1`, `node_2`, …). NEVER the
 *                       real node id. The server keeps the ref → real-id map privately and materializes
 *                       real ids back on the way in.
 *   - `role` / `kind` — trigger | action | logic (capability shape).
 *   - `provider` / `type` / `capabilityKey` — the public catalog identity (`slack:send_channel_message`).
 *     CLEARLY DISTINCT from `ref`: `ref` names WHICH node, `capabilityKey` names WHAT it is.
 *   - `description`   — the CATALOG display name (e.g. "Send Channel Message"). Public metadata, never
 *                       the user's own node label (`WorkflowNode.displayName` is dropped — it may carry
 *                       user text).
 *   - `config`        — SAFE, EDITABLE fields ONLY (see `EditableGraphConfigField` + the build policy):
 *                       registry-declared, non-secret, non-connection fields, with values echoed ONLY
 *                       for low-risk primitive/enum types and redacted to a presence flag otherwise.
 *
 * What is EXCLUDED, wholesale and by construction (the build step is the enforcement, this contract is
 * the spec the no-leak test pins):
 *   - credentials & credential ids, tokens & secrets, OAuth / provider payloads,
 *   - hidden / internal / undeclared config (anything not in the node's registry meta),
 *   - other-member / unauthorized account data, secret variable VALUES,
 *   - real node / edge / workflow / account / user ids, the user's own node display name,
 *   - any `{{realNodeId.path}}` variable token (would leak a real id) — never echoed.
 *
 * The graph also carries a `version` (the deterministic draft digest from
 * `core/workflows/editableGraphVersion`) so a proposal can be REJECTED AS STALE if the draft changed
 * while the model was responding. Pure data — no behavior here.
 */

export const EDITABLE_GRAPH_SCHEMA_VERSION = 1 as const;

/** Prefix the builder uses for existing-node refs. New nodes the model adds use {@link NEW_NODE_REF_PREFIX}. */
export const EXISTING_NODE_REF_PREFIX = "node_" as const;
/** Prefix the model MUST use for refs of nodes it ADDS (so a new ref is never confused with an existing one). */
export const NEW_NODE_REF_PREFIX = "new_" as const;
/** Prefix the builder uses for existing-connection (edge) refs — for removeEdge / replaceEdge targets. */
export const EXISTING_EDGE_REF_PREFIX = "edge_" as const;

/**
 * One SAFE, editable config field surfaced to the model. `value` is present ONLY for low-risk
 * primitive/enum types (boolean / number / single select / cron / date-time family) — the kinds that
 * make "change the threshold" / "remove that delay" resolvable without leaking text. For free-text,
 * recipients, channels, key-value, files, and anything that could carry PII/secret/a real-id token,
 * `value` is OMITTED and `isSet` reports only whether the user has filled it in.
 */
export interface EditableGraphConfigField {
  /** The registry field key (e.g. "channel", "to", "threshold"). Never a value. */
  readonly key: string;
  /** The registry field label (e.g. "Channel"). Public catalog metadata. */
  readonly label: string;
  /** The registry field type (e.g. "select", "number", "text"). */
  readonly type: string;
  readonly required: boolean;
  /** Whether the user has set this field (presence only — no value). */
  readonly isSet: boolean;
  /** Low-risk current value, echoed ONLY for safe primitive/enum types. Absent otherwise. */
  readonly value?: string | number | boolean;
}

/** One node in the model-facing editable graph. `ref` is opaque; `capabilityKey` is the public catalog id. */
export interface EditableGraphNode {
  /** Opaque, stable per-request reference. NEVER the real node id. */
  readonly ref: string;
  readonly role: "trigger" | "action" | "logic";
  /** Same as `role` for now; kept explicit so the prompt can speak in node "kind". */
  readonly kind: string;
  readonly provider: string;
  readonly type: string;
  /** Public catalog identity `provider:type` — what the node IS (distinct from `ref` = which node). */
  readonly capabilityKey: string;
  /** Safe display description (catalog display name). Optional — absent when the capability is unknown. */
  readonly description?: string;
  /** Safe, editable config fields only. */
  readonly config: readonly EditableGraphConfigField[];
}

/** One edge in the model-facing editable graph, by opaque node ref. `ref` targets it for remove/replace. */
export interface EditableGraphEdge {
  /** Opaque, stable per-request connection reference (`edge_1`, …). Used for removeEdge / replaceEdge. */
  readonly ref: string;
  readonly fromRef: string;
  readonly toRef: string;
  readonly label?: string;
}

/** The complete model-facing editable graph. Built server-side; the ref→realId map is kept PRIVATE. */
export interface EditableWorkflowGraph {
  readonly schemaVersion: typeof EDITABLE_GRAPH_SCHEMA_VERSION;
  /** Deterministic draft digest (stale-detection token). Opaque — compare for equality only. */
  readonly version: string;
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly nodes: readonly EditableGraphNode[];
  readonly edges: readonly EditableGraphEdge[];
}
