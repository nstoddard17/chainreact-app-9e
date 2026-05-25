import type { RiskLevel } from "@/contracts/actionMeta";
import type {
  WorkflowDefinition,
  WorkflowEdge,
  WorkflowNode,
  WorkflowNodePosition,
} from "@/contracts/workflowDefinition";
import type { WorkflowCostEstimate } from "@/services/billing/workflowCostEstimator";

/**
 * WorkflowPatch types (Slice 4.AI-3).
 *
 * The future React Agent proposes `WorkflowPatch` objects; deterministic V2
 * code (`validateWorkflowPatch`) validates them before any preview/apply is
 * allowed. This module defines the patch envelope, the operation union, and
 * the validation result shape.
 *
 * Plan reference: docs/slices/phase-4/ai-architecture-react-agent-plan.md §6.
 *
 * Design rules encoded here:
 *   - Small diffs over an existing `WorkflowDefinition` — never whole-JSON
 *     regeneration. Operations name node/edge ids; untouched nodes/edges are
 *     preserved byte-for-byte by the apply step.
 *   - `riskLevel` / `requiresConfirmation` on the ENVELOPE are model-proposed
 *     and ADVISORY ONLY. The validator recomputes both deterministically and
 *     the result's values are authoritative — a model cannot downgrade risk.
 *   - This slice does NOT apply patches to the DB, call AI models, or mutate
 *     workflows. It defines + validates proposals only.
 */

// ─── Operations ────────────────────────────────────────────────────────────

/**
 * Supported operations for AI-3. Deferred (documented as future): renameNode
 * (WorkflowNode has no `label` field today — see §14 open decision), and all
 * template operations.
 */
export type PatchOperation =
  | { op: "addNode"; node: WorkflowNode }
  | {
      op: "updateNodeConfig";
      nodeId: string;
      /** Partial config merged into the node's config (or full replacement). */
      config: Record<string, unknown>;
      /** When true, replace the entire config instead of shallow-merging. */
      replace?: boolean;
    }
  | { op: "removeNode"; nodeId: string }
  | { op: "addEdge"; edge: WorkflowEdge }
  | { op: "removeEdge"; edgeId: string }
  | { op: "replaceEdge"; edgeId: string; edge: WorkflowEdge }
  | { op: "moveNode"; nodeId: string; position: WorkflowNodePosition }
  | {
      op: "repairVariableReference";
      nodeId: string;
      /** Top-level config key to rewrite (nested paths are a documented follow-up). */
      fieldPath: string;
      /** New `{{nodeId.path}}` reference token to set at that key. */
      newReference: string;
    }
  | { op: "replaceTrigger"; node: WorkflowNode };

export type PatchOperationKind = PatchOperation["op"];

// ─── Envelope ──────────────────────────────────────────────────────────────

export interface WorkflowPatch {
  patchId: string;
  /** null = applies to a freshly-created draft (no persisted workflow yet). */
  workflowId: string | null;
  /** Revision the patch was computed against — optimistic concurrency. */
  baseRevision: string;
  /** Ordered; applied atomically. */
  operations: PatchOperation[];
  /** Human-readable one-liner. */
  summary: string;
  /** User-visible reasoning summary — NOT raw chain-of-thought. */
  rationale: string;
  /** Model-PROPOSED risk — advisory only; the validator recomputes + overrides. */
  riskLevel?: RiskLevel;
  /** Model-PROPOSED confirmation flag — advisory only; the validator recomputes. */
  requiresConfirmation?: boolean;
}

// ─── Validation errors / warnings ────────────────────────────────────────────

export type PatchErrorCode =
  | "INVALID_PATCH" // envelope/operation failed structural (Zod) validation
  | "UNSUPPORTED_OPERATION" // unknown `op` discriminator
  | "BASE_REVISION_MISSING" // empty baseRevision
  | "PATCH_CONFLICT" // baseRevision != current revision (stale base)
  | "UNKNOWN_NODE" // op references a node id not in the definition
  | "UNKNOWN_ACTION" // action node provider:type not in the discovery registry
  | "UNKNOWN_TRIGGER" // trigger node provider:type not in the discovery registry
  | "INVALID_CONFIG" // config value violates the field's declared type
  | "MISSING_REQUIRED_FIELD" // a required FieldMeta field is absent/empty
  | "INVALID_EDGE" // edge endpoint missing / self-loop / duplicate (from,to,label)
  | "DUPLICATE_NODE_ID" // candidate has two nodes with the same id
  | "DUPLICATE_EDGE_ID" // candidate has two edges with the same id
  | "MULTIPLE_TRIGGERS" // candidate has more than one trigger node
  | "INVALID_VARIABLE_REFERENCE" // malformed token or referenced node missing
  | "DOWNSTREAM_VARIABLE_REFERENCE" // references a non-ancestor (downstream/unreachable) node
  | "MISSING_OUTPUT_PATH" // referenced output path not present in the source's meta
  | "COST_ESTIMATE_FAILED"; // the deterministic estimator threw unexpectedly

export interface PatchValidationError {
  code: PatchErrorCode;
  /** User-explainable message. NEVER contains secrets / resolved config values. */
  message: string;
  nodeId?: string;
  edgeId?: string;
  /** Index into `operations[]` when the error is op-scoped. */
  operationIndex?: number;
  /** Field / variable path when relevant (a key name, never a value). */
  path?: string;
}

export type PatchWarningCode =
  | "UNKNOWN_CONFIG_FIELD" // field not declared in FieldMeta (authoritative reject happens at apply/dispatch)
  | "ORPHANS_DOWNSTREAM" // a removal disconnects downstream nodes
  | "DELETES_USER_WORK" // a removal/replace discards existing nodes/edges
  | "SUSPICIOUS_BRANCH_LABEL" // labeled edge from a non-branching node (route-membership check deferred)
  | "COST_WARNING"; // pass-through from the COST-2 estimator

export interface PatchValidationWarning {
  code: PatchWarningCode;
  message: string;
  nodeId?: string;
  edgeId?: string;
}

// ─── Risk classification ──────────────────────────────────────────────────────

export type RiskReasonCode =
  | "destructive_action" // affected action is isDestructive
  | "confirmation_required_action" // affected action requires typed confirmation
  | "high_risk_action" // affected action riskLevel = high
  | "medium_risk_action" // affected action riskLevel = medium
  | "unknown_action_safety" // affected action meta unavailable → fail closed
  | "removes_user_work" // removal of nodes/edges
  | "orphans_downstream" // removal disconnects downstream nodes
  | "replaces_trigger"; // trigger swap

export interface RiskReason {
  code: RiskReasonCode;
  message: string;
  nodeId?: string;
}

// ─── Result ────────────────────────────────────────────────────────────────

export interface PatchValidationResult {
  ok: boolean;
  /**
   * The candidate definition the patch would produce. Present when the patch
   * applied structurally (even if later checks failed), so callers can render
   * a preview. Absent only when an operation could not be applied at all.
   */
  candidateDefinition?: WorkflowDefinition;
  errors: PatchValidationError[];
  warnings: PatchValidationWarning[];
  /** Deterministic — recomputed by the validator, never trusted from the patch. */
  riskLevel: RiskLevel;
  /** Deterministic — recomputed by the validator, never trusted from the patch. */
  requiresConfirmation: boolean;
  riskReasons: RiskReason[];
  /** From the COST-2 estimator over the candidate. Undefined if it failed. */
  taskCostEstimate?: WorkflowCostEstimate;
  /** Node ids the patch adds / changes / removes. */
  affectedNodeIds: string[];
  /** Human-readable, secret-free one-liner describing the change. */
  previewSummary: string;
}

export interface ValidateWorkflowPatchOptions {
  /**
   * The workflow's current persisted revision. When provided and it differs
   * from `patch.baseRevision`, the result carries a `PATCH_CONFLICT` error
   * (optimistic concurrency). When omitted, only emptiness of `baseRevision`
   * is checked (`BASE_REVISION_MISSING`).
   */
  currentRevision?: string;
}
