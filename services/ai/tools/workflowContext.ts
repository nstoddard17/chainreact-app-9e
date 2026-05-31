/**
 * AI grounding tools over the current workflow graph (Slice 4.AI-2).
 *
 * Plan reference: docs/slices/phase-4/ai-architecture-react-agent-plan.md §5/§9.
 *
 * Read-only, deterministic, no model calls, no mutation. All three tools take
 * `(userId, workflowId)` and enforce account ownership: a workflow outside the
 * caller's account collapses to NOT_FOUND (existence is never leaked).
 * `getById` is itself RLS-scoped to the caller's account; the explicit
 * `record.accountId === <caller account>` guard (4.ACCOUNT-MODEL-7) is
 * defense-in-depth so the tools are safe regardless of which Supabase client
 * the repository uses.
 *
 *   - getWorkflowGraphForAI      — full nodes/edges (config secret-redacted).
 *   - getWorkflowSummaryForAI    — compact, cheap summary (one DB read).
 *   - getWorkflowValidationStateForAI — deterministic issues from EXISTING
 *     validators only; deeper checks are explicitly deferred to AI-3.
 */

import type {
  WorkflowDefinition,
  WorkflowEdge,
  WorkflowNode,
  WorkflowState,
} from "@/contracts/workflow";
import { WorkflowDefinitionSchema } from "@/contracts/workflow";
import type { RiskLevel } from "@/contracts/actionMeta";
import type { TriggerActivation } from "@/contracts/triggerMeta";
import { parseReferences } from "@/core/workflows/variableReferences";
import {
  getActionMeta as lookupActionMeta,
  getTriggerMeta as lookupTriggerMeta,
} from "@/services/discovery/_registry";
import { checkActivationPreconditions } from "@/services/triggers/preconditions";
import {
  getById,
  type WorkflowRecord,
} from "@/repositories/workflows";
import { ensurePersonalAccount } from "@/services/accounts/ensurePersonalAccount";
import { redactSecrets } from "./redact";
import { aiToolErr, aiToolOk, type AiToolResult } from "./types";

const TRIGGER_ALIAS = "trigger";

/**
 * Load + account-ownership-guard a workflow. Both "missing" and "not in the
 * caller's account" collapse to NOT_FOUND (existence is never leaked).
 *
 * 4.ACCOUNT-MODEL-7: ownership is account-based. `getById` is itself RLS-
 * scoped to the caller's account, so the explicit `record.accountId ===
 * account.id` comparison is defense-in-depth that holds even if a test or
 * future caller swaps the underlying Supabase client. The caller's account is
 * their personal account until the switcher slice ships. `created_by_user_id`
 * is provenance and is NEVER consulted for authorization.
 */
async function loadOwned(
  userId: string,
  workflowId: string,
): Promise<AiToolResult<WorkflowRecord>> {
  let record: WorkflowRecord | null;
  try {
    record = await getById(workflowId);
  } catch {
    return aiToolErr("SERVER_ERROR", "Couldn't load the workflow.");
  }
  if (!record) {
    return aiToolErr("NOT_FOUND", `No workflow '${workflowId}'.`);
  }
  let accountId: string;
  try {
    accountId = (await ensurePersonalAccount(userId)).id;
  } catch {
    return aiToolErr("SERVER_ERROR", "Couldn't load the workflow.");
  }
  if (record.accountId !== accountId) {
    return aiToolErr("NOT_FOUND", `No workflow '${workflowId}'.`);
  }
  return aiToolOk(record);
}

// ─── getWorkflowGraphForAI ───────────────────────────────────────────────────

export interface WorkflowGraphNodeView {
  readonly id: string;
  readonly kind: WorkflowNode["kind"];
  readonly provider: string;
  readonly type: string;
  /** Author-entered config with secret-shaped values redacted. */
  readonly config: Record<string, unknown>;
  readonly position: WorkflowNode["position"];
}

export interface WorkflowGraphView {
  readonly workflowId: string;
  readonly name: string;
  readonly state: WorkflowState;
  /** Version signals (a content hash arrives with the AI-3 patch engine). */
  readonly activeRevisionId: string | null;
  readonly updatedAt: string;
  readonly nodes: readonly WorkflowGraphNodeView[];
  readonly edges: readonly WorkflowEdge[];
}

export async function getWorkflowGraphForAI(
  userId: string,
  workflowId: string,
): Promise<AiToolResult<WorkflowGraphView>> {
  const loaded = await loadOwned(userId, workflowId);
  if (!loaded.ok) return loaded;
  const record = loaded.data;
  const def = record.draftDefinition;

  const nodes: WorkflowGraphNodeView[] = def.nodes.map((n) => ({
    id: n.id,
    kind: n.kind,
    provider: n.provider,
    type: n.type,
    config: redactSecrets(n.config),
    position: n.position,
  }));

  return aiToolOk({
    workflowId: record.id,
    name: record.name,
    state: record.state,
    activeRevisionId: record.activeRevisionId,
    updatedAt: record.updatedAt,
    nodes,
    edges: def.edges,
  });
}

// ─── getWorkflowSummaryForAI ─────────────────────────────────────────────────

export interface TriggerSummaryView {
  readonly nodeId: string;
  readonly key: string;
  readonly displayName: string;
  readonly activation: TriggerActivation;
}

export interface ActionSummaryView {
  readonly nodeId: string;
  readonly key: string;
  readonly displayName: string;
}

export interface HighRiskNodeView {
  readonly nodeId: string;
  readonly key: string;
  readonly riskLevel: RiskLevel;
  readonly isDestructive: boolean;
  readonly requiresConfirmation: boolean;
}

export interface UnknownNodeView {
  readonly nodeId: string;
  readonly key: string;
}

export interface WorkflowSummaryView {
  readonly workflowId: string;
  readonly name: string;
  readonly state: WorkflowState;
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly isEmpty: boolean;
  readonly hasTrigger: boolean;
  readonly trigger: TriggerSummaryView | null;
  readonly actions: readonly ActionSummaryView[];
  readonly providersUsed: readonly string[];
  /** Providers used by a node whose metadata requires an OAuth integration. */
  readonly requiresIntegrationProviders: readonly string[];
  /** Action nodes flagged high-risk / destructive / confirmation-required. */
  readonly highRiskNodes: readonly HighRiskNodeView[];
  /** Nodes whose `provider:type` has no registered metadata (drift / incomplete). */
  readonly unknownNodes: readonly UnknownNodeView[];
}

function nodeKey(node: WorkflowNode): string {
  return `${node.provider}:${node.type}`;
}

export async function getWorkflowSummaryForAI(
  userId: string,
  workflowId: string,
): Promise<AiToolResult<WorkflowSummaryView>> {
  const loaded = await loadOwned(userId, workflowId);
  if (!loaded.ok) return loaded;
  const record = loaded.data;
  const def = record.draftDefinition;

  let trigger: TriggerSummaryView | null = null;
  const actions: ActionSummaryView[] = [];
  const highRiskNodes: HighRiskNodeView[] = [];
  const unknownNodes: UnknownNodeView[] = [];
  const providersUsed = new Set<string>();
  const requiresIntegrationProviders = new Set<string>();

  for (const node of def.nodes) {
    if (node.provider) providersUsed.add(node.provider);
    const key = nodeKey(node);

    if (node.kind === "trigger") {
      const meta = node.type ? lookupTriggerMeta(key) : undefined;
      if (meta) {
        trigger = {
          nodeId: node.id,
          key,
          displayName: meta.displayName,
          activation: meta.activation,
        };
        if (meta.requiresIntegration) requiresIntegrationProviders.add(node.provider);
      } else {
        unknownNodes.push({ nodeId: node.id, key });
      }
      continue;
    }

    // action
    const meta = node.type ? lookupActionMeta(key) : undefined;
    if (!meta) {
      unknownNodes.push({ nodeId: node.id, key });
      continue;
    }
    actions.push({ nodeId: node.id, key, displayName: meta.displayName });
    if (meta.requiresIntegration) requiresIntegrationProviders.add(node.provider);
    if (meta.riskLevel === "high" || meta.isDestructive || meta.requiresConfirmation) {
      highRiskNodes.push({
        nodeId: node.id,
        key,
        riskLevel: meta.riskLevel,
        isDestructive: meta.isDestructive,
        requiresConfirmation: meta.requiresConfirmation,
      });
    }
  }

  return aiToolOk({
    workflowId: record.id,
    name: record.name,
    state: record.state,
    nodeCount: def.nodes.length,
    edgeCount: def.edges.length,
    isEmpty: def.nodes.length === 0,
    hasTrigger: trigger !== null,
    trigger,
    actions,
    providersUsed: [...providersUsed].sort(),
    requiresIntegrationProviders: [...requiresIntegrationProviders].sort(),
    highRiskNodes,
    unknownNodes,
  });
}

// ─── getWorkflowValidationStateForAI ─────────────────────────────────────────

export type ValidationSeverity = "error" | "warning";

export type ValidationIssueCode =
  | "STRUCTURAL_INVALID"
  | "EMPTY_WORKFLOW"
  | "UNKNOWN_NODE_TYPE"
  | "MISSING_REQUIRED_FIELD"
  | "INVALID_VARIABLE_REFERENCE"
  | "INTEGRATION_NOT_CONNECTED"
  | "INTEGRATION_CHECK_UNAVAILABLE";

export interface ValidationIssue {
  readonly code: ValidationIssueCode;
  readonly message: string;
  readonly nodeId?: string;
  readonly field?: string;
  readonly severity: ValidationSeverity;
}

export interface ValidationStateView {
  readonly workflowId: string;
  /** True when no error-severity issues were found in the checked scope. */
  readonly ok: boolean;
  readonly issues: readonly ValidationIssue[];
  /**
   * Honest scope marker — what this deterministic tool checks today vs what
   * the AI-3 WorkflowPatch validator will own. The tool does NOT pretend to
   * be a complete validator.
   */
  readonly coverage: {
    readonly checked: readonly string[];
    readonly deferredToAI3: readonly string[];
  };
}

const VALIDATION_CHECKED: readonly string[] = [
  "structural_schema",
  "empty_workflow",
  "unknown_node_type",
  "required_fields_present",
  "variable_reference_node_existence",
  "integration_connectivity",
];

const VALIDATION_DEFERRED_TO_AI3: readonly string[] = [
  "variable_path_output_resolution",
  "upstream_reachability_of_variable_refs",
  "options_value_validation",
  "handler_zod_config_validation",
  "field_type_coercion",
  "cross_field_consistency",
];

/** `0` and `false` are valid explicit values (Q5) — only blank/absent counts as missing. */
function isMissingValue(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/** Collect candidate string values from a config object (top level + array items). */
function configStrings(config: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const value of Object.values(config)) {
    if (typeof value === "string") {
      out.push(value);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string") out.push(item);
      }
    }
  }
  return out;
}

function checkNodeIssues(def: WorkflowDefinition): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const nodeIds = new Set(def.nodes.map((n) => n.id));

  for (const node of def.nodes) {
    const key = nodeKey(node);
    const meta =
      node.type === ""
        ? undefined
        : node.kind === "trigger"
          ? lookupTriggerMeta(key)
          : lookupActionMeta(key);

    if (!meta) {
      issues.push({
        code: "UNKNOWN_NODE_TYPE",
        message: `Node '${node.id}' has no registered metadata for '${key}'.`,
        nodeId: node.id,
        severity: "error",
      });
    } else {
      for (const field of meta.fields) {
        if (field.required && isMissingValue(node.config[field.name])) {
          issues.push({
            code: "MISSING_REQUIRED_FIELD",
            message: `Node '${node.id}' is missing required field '${field.name}'.`,
            nodeId: node.id,
            field: field.name,
            severity: "error",
          });
        }
      }
    }

    // Light variable-reference check: referenced node must exist in the graph
    // (the `trigger` alias is always valid). Path / output / reachability
    // validation is deferred to AI-3.
    for (const str of configStrings(node.config)) {
      for (const ref of parseReferences(str)) {
        if (ref.nodeId !== TRIGGER_ALIAS && !nodeIds.has(ref.nodeId)) {
          issues.push({
            code: "INVALID_VARIABLE_REFERENCE",
            message: `Node '${node.id}' references unknown node '${ref.nodeId}' in '${ref.token}'.`,
            nodeId: node.id,
            severity: "error",
          });
        }
      }
    }
  }

  return issues;
}

export async function getWorkflowValidationStateForAI(
  userId: string,
  workflowId: string,
): Promise<AiToolResult<ValidationStateView>> {
  const loaded = await loadOwned(userId, workflowId);
  if (!loaded.ok) return loaded;
  const record = loaded.data;

  const issues: ValidationIssue[] = [];

  // 1. Structural schema (the same invariant the save path enforces).
  const parsed = WorkflowDefinitionSchema.safeParse(record.draftDefinition);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      issues.push({
        code: "STRUCTURAL_INVALID",
        message:
          issue.path.length > 0
            ? `${issue.path.join(".")}: ${issue.message}`
            : issue.message,
        severity: "error",
      });
    }
  }

  // 2. Node-level checks (unknown type, required fields, variable node existence).
  issues.push(...checkNodeIssues(record.draftDefinition));

  // 3. Integration connectivity via the existing activation precondition helper.
  try {
    const pre = await checkActivationPreconditions(record, "activate");
    if (!pre.ok) {
      for (const failure of pre.failures ?? []) {
        issues.push({
          code:
            failure.code === "EMPTY_WORKFLOW"
              ? "EMPTY_WORKFLOW"
              : "INTEGRATION_NOT_CONNECTED",
          message: failure.message,
          severity: "error",
        });
      }
    }
  } catch {
    issues.push({
      code: "INTEGRATION_CHECK_UNAVAILABLE",
      message: "Couldn't verify integration connectivity. Try again.",
      severity: "warning",
    });
  }

  const ok = !issues.some((i) => i.severity === "error");

  return aiToolOk({
    workflowId: record.id,
    ok,
    issues,
    coverage: {
      checked: VALIDATION_CHECKED,
      deferredToAI3: VALIDATION_DEFERRED_TO_AI3,
    },
  });
}
