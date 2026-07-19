import { getByIdServiceRole } from "@/repositories/workflows";
import { isMemberServiceRole } from "@/repositories/accountMemberships";
import type { WorkflowDefinition, WorkflowNode } from "@/contracts/workflowDefinition";
import {
  findFieldGaps,
  findGraphIssues,
} from "@/core/workflows/executionReadiness";
import { buildRequiredFieldsByType } from "@/core/workflows/requiredFields";
import {
  getActionMeta,
  getTriggerMeta,
  listAllActionMetas,
  listAllTriggerMetas,
} from "@/services/discovery/_registry";
import { findInvalidVariableReferences } from "@/core/workflows/invalidVariableReferences";
import { resolveNodeDisplayNameFromRegistry } from "@/services/ai/nodeLabel";
import { getNodeSchema } from "@/services/ai/tools/providerCatalog";

/**
 * Workflow-graph STRUCTURAL diagnostic capability (Slice 4.MCP-STAGE-2B-5 / Phase C-1).
 *
 * The reusable "brain" for "what is structurally wrong with this workflow's graph,
 * for this subject." Consumed by the gated MCP route
 * (`app/api/internal/diagnostics/workflow-graph`) and callable in-process.
 *
 * Separation of concerns (identical to the 2B-3 readiness capability):
 *   - The MACHINE bearer gate (`applyDiagnosticsGate`) stays in the route.
 *   - This service OWNS the per-account MEMBERSHIP authz (`isMemberServiceRole`),
 *     so every consumer inherits the same wall. A non-member learns only
 *     NO_ACCOUNT_ACCESS; nothing about the graph is revealed.
 *
 * NO-LEAK: the raw `WorkflowRecord` is NEVER spread. Findings carry STRUCTURE only —
 * node ids, edge ids/endpoints, the structural `provider`/`nodeType` dispatch ids,
 * field NAMES/LABELS, dotted reference PATH locations, and the user-AUTHORED `{{...}}`
 * token text. Node `config` VALUES, trigger payloads, provider bodies, workflow name,
 * `createdByUserId`, and raw errors NEVER reach the DTO. (The only config content that
 * leaves is a broken `{{...}}` token the user themselves typed — already shown inline
 * by the design-time field validator, same rule the readiness capability uses.)
 *
 * Reuse, not duplication: graph integrity (`findGraphIssues`), required-field gaps
 * (`findFieldGaps`), and broken variable refs (`findInvalidVariableReferences`) are the
 * SAME pure `core/` validators the engine + builder use. This capability adds the one
 * structural check they don't: per-node "is `provider:type` a registered builder node?"
 */

export type GraphFindingKind =
  | "NO_TRIGGER"
  | "MULTIPLE_TRIGGERS"
  | "STALE_EDGE"
  | "UNREACHABLE_NODE"
  | "BRANCH_WIRING"
  | "UNSUPPORTED_NODE"
  | "INCOMPLETE_NODE_TYPE"
  | "MISSING_REQUIRED_FIELDS"
  | "UNRESOLVED_REFERENCE";

export interface GraphFindingDTO {
  readonly kind: GraphFindingKind;
  readonly severity: "error" | "warning" | "unknown";
  readonly nodeId?: string;
  readonly displayName?: string;
  readonly edgeId?: string;
  readonly from?: string;
  readonly to?: string;
  /** Structural provider id (e.g. "slack") — not a value. */
  readonly provider?: string;
  /** Structural action/trigger dispatch id (e.g. "send_channel_message") — not a value. */
  readonly nodeType?: string;
  /** Field LABELS of empty required fields — names only, never values. */
  readonly missingFields?: readonly string[];
  /** The user-authored `{{...}}` token (safe to echo). */
  readonly token?: string;
  /** Display label of the field holding a broken ref. */
  readonly fieldLabel?: string;
  /** Dotted reference path LOCATION (no value). */
  readonly refPath?: string;
  /** Why a finding is `warning`/`unknown` (the detection basis). */
  readonly reason?: string;
}

export interface NodeLabelDTO {
  readonly nodeId: string;
  readonly label: string;
}

export interface WorkflowGraphDTO {
  readonly workflowId: string;
  readonly access: "OK" | "NOT_FOUND" | "NO_ACCOUNT_ACCESS";
  // ── Present ONLY when access === "OK". ──
  /** True when there are no `error`-severity findings. Warnings do not flip this. */
  readonly structurallyValid?: boolean;
  readonly nodeCount?: number;
  readonly edgeCount?: number;
  readonly findings?: readonly GraphFindingDTO[];
  readonly nodeLabels?: readonly NodeLabelDTO[];
}

/** Safe field label from the node's registry schema; falls back to the field NAME. */
function resolveFieldLabel(node: WorkflowNode, fieldKey: string): string {
  if (!node.type) return fieldKey;
  const schema = getNodeSchema(`${node.provider}:${node.type}`);
  if (!schema.ok) return fieldKey;
  return schema.data.fields.find((f) => f.name === fieldKey)?.label ?? fieldKey;
}

/** Per-node support state vs the discovery action/trigger meta registry. */
function nodeSupport(node: WorkflowNode): "yes" | "no" | "incomplete" {
  const type = (node.type ?? "").trim();
  if (type === "") return "incomplete";
  const key = `${node.provider}:${type}`;
  const meta = node.kind === "trigger" ? getTriggerMeta(key) : getActionMeta(key);
  return meta ? "yes" : "no";
}

/** Assemble the structural findings list for a definition (no authz here). */
export function analyzeWorkflowGraph(def: WorkflowDefinition): GraphFindingDTO[] {
  const findings: GraphFindingDTO[] = [];

  // 1. Graph integrity (pure core validator: no_trigger / multiple_triggers /
  //    stale_edge / unreachable_node). All error-severity.
  for (const g of findGraphIssues(def.nodes, def.edges)) {
    const kind =
      g.code === "no_trigger"
        ? "NO_TRIGGER"
        : g.code === "multiple_triggers"
          ? "MULTIPLE_TRIGGERS"
          : g.code === "stale_edge"
            ? "STALE_EDGE"
            : g.code === "missing_branch_edge" || g.code === "stale_branch_edge"
              ? "BRANCH_WIRING"
              : "UNREACHABLE_NODE";
    findings.push({
      kind,
      severity: "error",
      ...(g.nodeId !== undefined && { nodeId: g.nodeId }),
      ...(g.displayName !== undefined && { displayName: g.displayName }),
      ...(g.edgeId !== undefined && { edgeId: g.edgeId }),
      ...(g.from !== undefined && { from: g.from }),
      ...(g.to !== undefined && { to: g.to }),
    });
  }

  // 2. Per-node "is this a registered builder node?" — the check the core
  //    validators don't do. Warning-severity: the discovery-meta registry does
  //    NOT include native/control-flow types, so an unresolved key may be a
  //    native node, a typo, or a deleted action. Never an error → structurally
  //    valid stays driven by the engine's real graph verdict above.
  for (const node of def.nodes) {
    const support = nodeSupport(node);
    if (support === "incomplete") {
      findings.push({
        kind: "INCOMPLETE_NODE_TYPE",
        severity: "warning",
        nodeId: node.id,
        provider: node.provider,
        reason: "node has no action/trigger type selected yet (transient builder state)",
      });
    } else if (support === "no") {
      findings.push({
        kind: "UNSUPPORTED_NODE",
        severity: "warning",
        nodeId: node.id,
        provider: node.provider,
        nodeType: node.type,
        reason:
          "no builder action/trigger metadata registered for this provider:type — " +
          "may be a native/control-flow node, a typo, or a deleted action (discovery-meta check)",
      });
    }
  }

  // 3. Missing required fields → field LABELS only.
  const requiredFieldsByType = buildRequiredFieldsByType(listAllActionMetas(), listAllTriggerMetas());
  for (const gap of findFieldGaps(def.nodes, requiredFieldsByType)) {
    findings.push({
      kind: "MISSING_REQUIRED_FIELDS",
      severity: "error",
      nodeId: gap.nodeId,
      displayName: gap.displayName,
      missingFields: gap.missingFields,
    });
  }

  // 4. Broken `{{...}}` references → LOCATION + user-authored token only.
  const nodesById = new Map(def.nodes.map((n) => [n.id, n]));
  for (const ref of findInvalidVariableReferences(def.nodes)) {
    const node = nodesById.get(ref.nodeId);
    findings.push({
      kind: "UNRESOLVED_REFERENCE",
      severity: "error",
      nodeId: ref.nodeId,
      token: ref.token,
      fieldLabel: node ? resolveFieldLabel(node, ref.fieldKey) : ref.fieldKey,
      refPath: ref.refPath,
    });
  }

  return findings;
}

function buildNodeLabels(nodes: readonly WorkflowNode[]): NodeLabelDTO[] {
  return nodes.map((n) => ({
    nodeId: n.id,
    label: resolveNodeDisplayNameFromRegistry({
      kind: n.kind,
      provider: n.provider,
      type: n.type,
      ...(n.displayName !== undefined ? { displayName: n.displayName } : {}),
    }),
  }));
}

/**
 * Diagnose a workflow's graph structure for a subject. Owns the raw read, the
 * membership authz wall, the structural analysis, and sanitized DTO assembly.
 */
export async function diagnoseWorkflowGraph(input: {
  subjectUserId: string;
  workflowId: string;
  /** Client's current builder draft (validated upstream); changes WHICH graph is analyzed, never WHO may. */
  draftOverride?: WorkflowDefinition;
}): Promise<WorkflowGraphDTO> {
  const { subjectUserId, workflowId } = input;

  const workflow = await getByIdServiceRole(workflowId);
  if (workflow === null) {
    return { workflowId, access: "NOT_FOUND" };
  }

  const authorized = await isMemberServiceRole(workflow.accountId, subjectUserId);
  if (!authorized) {
    return { workflowId, access: "NO_ACCOUNT_ACCESS" };
  }

  const def = input.draftOverride ?? workflow.draftDefinition;
  const findings = analyzeWorkflowGraph(def);
  const structurallyValid = !findings.some((f) => f.severity === "error");

  return {
    workflowId,
    access: "OK",
    structurallyValid,
    nodeCount: def.nodes.length,
    edgeCount: def.edges.length,
    findings,
    nodeLabels: buildNodeLabels(def.nodes),
  };
}
