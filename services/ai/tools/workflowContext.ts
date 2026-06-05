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
import {
  listActiveByAccount,
  type IntegrationRecord,
} from "@/repositories/integrations";
import { isMember } from "@/repositories/accountMemberships";
import {
  credentialSharingForProvider,
  type CredentialSharing,
} from "@/core/integrations/credentialSharing";
import { loadAcceptedNodeOwners } from "@/services/teamCredentials/nodeCredentialOwners";
import { redactSecrets } from "./redact";
import { aiToolErr, aiToolOk, type AiToolResult } from "./types";

const TRIGGER_ALIAS = "trigger";

/**
 * Load + account-membership-guard a workflow. Both "missing" and "not in an
 * account the caller belongs to" collapse to NOT_FOUND (existence is never
 * leaked).
 *
 * 4.ACCOUNT-MODEL-22D-3: authorization is **account membership**, so a TEAM
 * workflow (whose `account_id` is the team account, not anyone's personal
 * account) is addressable by every member — the pre-22D-3 personal-account
 * equality guard wrongly returned NOT_FOUND for team workflows. `getById` is
 * itself RLS-scoped to the caller's account memberships; the explicit
 * `isMember` check is defense-in-depth that holds even if a test or future
 * caller swaps the underlying Supabase client. `created_by_user_id` is
 * provenance — consulted for the credential-sharing policy below, NEVER for
 * authorization (any member may read the workflow's context).
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
  let member: boolean;
  try {
    member = await isMember(userId, record.accountId);
  } catch {
    return aiToolErr("SERVER_ERROR", "Couldn't load the workflow.");
  }
  if (!member) {
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

// ─── getWorkflowIntegrationAvailabilityForAI ─────────────────────────────────
//
// Slice 4.ACCOUNT-MODEL-22D-3 — per-provider integration availability for the
// providers a workflow uses, resolved the way EXECUTION (22B) resolves
// credentials, so the agent never suggests using (or reveals) a co-member's
// personal credential.

/** Non-OAuth pseudo-providers — no integration row exists; mirrors `preconditions.ts`. */
const NON_OAUTH_PROVIDERS: ReadonlySet<string> = new Set(["native"]);

export interface WorkflowProviderAvailabilityView {
  readonly provider: string;
  readonly sharing: CredentialSharing;
  /**
   * For account providers: any active account credential exists. For personal
   * providers: every EFFECTIVE OWNER of the provider's nodes has an active
   * credential (a co-member's personal credential that is not an effective owner
   * is never counted — execution wouldn't use it).
   */
  readonly connected: boolean;
  /**
   * Personal provider connected by its effective owner, requester is NOT that
   * owner — the step runs under the owner's connection. No label/email/id is
   * ever included.
   */
  readonly ownerControlled?: true;
  /**
   * Personal provider whose effective OWNER must connect (no active credential).
   * Mirrors 22B's execution connect-required failure.
   */
  readonly ownerMustConnect?: true;
}

export interface WorkflowIntegrationAvailabilityView {
  readonly workflowId: string;
  readonly providers: readonly WorkflowProviderAvailabilityView[];
}

/**
 * Report, per provider the workflow's nodes require, whether the credential the
 * run will ACTUALLY use is connected — applying the credential-sharing policy and
 * (CS-5) the accepted per-node credential owners:
 *
 *   - account/service provider → connected when the account has an active row
 *     (account-shared); visible to any member.
 *   - personal provider → resolved against its EFFECTIVE OWNERS across the nodes
 *     that use it. A node's effective owner is its ACCEPTED reassignment owner
 *     (`workflow_node_credentials`) when present, else the workflow CREATOR — the
 *     same identity CS-2 pins execution to. `connected` is true only when EVERY
 *     effective owner has an active credential. When the requester is the sole
 *     effective owner → full `connected:true`; otherwise `ownerControlled`; when
 *     an effective owner has no credential → `connected:false` + `ownerMustConnect`.
 *     A co-member credential that is not an effective owner is never counted.
 *
 * CS-5 flag gating: accepted owners are batch-loaded ONCE via
 * `loadAcceptedNodeOwners` (flag OFF → empty map → every effective owner is the
 * creator, i.e. byte-identical to the 22D-3 behavior). No DB lookup when OFF.
 *
 * The view carries provider ids + boolean/flag state only — NEVER a label, email,
 * in-provider id, token, scope, or the accepted `credentialOwnerUserId`.
 * Membership-guarded via `loadOwned`; a non-member gets NOT_FOUND.
 */
export async function getWorkflowIntegrationAvailabilityForAI(
  userId: string,
  workflowId: string,
): Promise<AiToolResult<WorkflowIntegrationAvailabilityView>> {
  const loaded = await loadOwned(userId, workflowId);
  if (!loaded.ok) return loaded;
  const record = loaded.data;

  // CS-5: accepted per-node owners (flag OFF → empty map, no DB call).
  const acceptedOwners = await loadAcceptedNodeOwners(record.id);

  // Required providers = every non-native provider used by a node. For PERSONAL
  // providers, also collect the distinct EFFECTIVE OWNERS across their nodes
  // (accepted node owner ?? creator) — never surfaced, only used to resolve
  // connected / ownerControlled / ownerMustConnect below.
  const requiredProviders = new Set<string>();
  const ownersByPersonalProvider = new Map<string, Set<string>>();
  for (const node of record.draftDefinition.nodes) {
    const provider = node.provider;
    if (!provider || NON_OAUTH_PROVIDERS.has(provider)) continue;
    requiredProviders.add(provider);
    if (credentialSharingForProvider(provider) === "personal") {
      const owner = acceptedOwners.get(node.id) ?? record.createdByUserId;
      const set = ownersByPersonalProvider.get(provider) ?? new Set<string>();
      set.add(owner);
      ownersByPersonalProvider.set(provider, set);
    }
  }
  if (requiredProviders.size === 0) {
    return aiToolOk({ workflowId: record.id, providers: [] });
  }

  let active: readonly IntegrationRecord[];
  try {
    active = await listActiveByAccount(record.accountId);
  } catch {
    return aiToolErr("SERVER_ERROR", "Couldn't load integration availability.");
  }

  const providers: WorkflowProviderAvailabilityView[] = [];
  for (const provider of [...requiredProviders].sort()) {
    const sharing = credentialSharingForProvider(provider);
    if (sharing === "account") {
      providers.push({
        provider,
        sharing,
        connected: active.some((i) => i.provider === provider),
      });
      continue;
    }
    // personal — resolve against the effective owners (mirrors CS-2 execution).
    const owners = ownersByPersonalProvider.get(provider) ?? new Set([record.createdByUserId]);
    const allOwnersConnected = [...owners].every((owner) =>
      active.some((i) => i.provider === provider && i.connectedByUserId === owner),
    );
    if (!allOwnersConnected) {
      providers.push({ provider, sharing, connected: false, ownerMustConnect: true });
    } else if (owners.size === 1 && owners.has(userId)) {
      // The requester is the sole effective owner — full availability.
      providers.push({ provider, sharing, connected: true });
    } else {
      // Connected, but the requester is not the (only) owner — redacted.
      providers.push({ provider, sharing, connected: true, ownerControlled: true });
    }
  }

  return aiToolOk({ workflowId: record.id, providers });
}
