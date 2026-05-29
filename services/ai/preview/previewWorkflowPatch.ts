/**
 * Deterministic WorkflowPatch preview service (Slice 4.AI-5).
 *
 * Composes:
 *   - AI-2 `getWorkflowGraphForAI` — load current definition (ownership +
 *     NOT_FOUND + config redaction) WITHOUT a DB write.
 *   - AI-3 `validateWorkflowPatch` — deterministic validation, candidate
 *     definition, risk/confirmation, and COST-2 task estimate.
 *   - AI-4 `explainWorkflowDefinition` — pure in-memory before/after summaries
 *     (the candidate is NEVER written to the DB just to describe it).
 *
 * Read-only: NO model calls, NO provider API calls, NO DB writes, NO mutation,
 * NO billing deduction. The result is a safe "what would change" view; actual
 * apply/save is a later slice (AI-6) and must load the UNREDACTED definition.
 *
 * Plan reference: docs/slices/phase-4/ai-architecture-react-agent-plan.md §6.
 */

import type { WorkflowDefinition, WorkflowEdge, WorkflowNode } from "@/contracts/workflow";
import { isSecretKey } from "@/services/ai/tools/redact";
import { getWorkflowGraphForAI } from "@/services/ai/tools/workflowContext";
import { aiToolOk, type AiToolResult } from "@/services/ai/tools/types";
import { explainWorkflowDefinition } from "@/services/ai/explain/explainDefinition";
import { resolveNodeDisplayNameFromRegistry } from "@/services/ai/nodeLabel";
import { validateWorkflowPatch } from "@/services/workflows/patch/validateWorkflowPatch";
import type { PatchOperation } from "@/services/workflows/patch/types";
import type {
  PatchChangeSummary,
  PatchPreviewResult,
  PreviewWorkflowPatchInput,
} from "./types";

/** Friendly stand-in when an op references a node not in the (candidate) graph. */
const UNRESOLVED_NODE_LABEL = "a node that's no longer in this workflow";

/** Friendly user-facing label for a node — honors user displayName, then meta. */
function labelForNode(node: WorkflowNode | undefined): string {
  if (!node) return UNRESOLVED_NODE_LABEL;
  return resolveNodeDisplayNameFromRegistry(node);
}

function describeEdge(
  edge: WorkflowEdge | undefined,
  nodeLabel: (id: string) => string,
  fallbackId: string,
): string {
  if (!edge) return `connection ${fallbackId}`;
  return `"${nodeLabel(edge.from)}" → "${nodeLabel(edge.to)}"`;
}

/** Build a value-free change summary for each operation. */
function buildChanges(
  operations: readonly PatchOperation[],
  currentDef: WorkflowDefinition,
  candidate: WorkflowDefinition | undefined,
): PatchChangeSummary[] {
  const currentNodes = new Map(currentDef.nodes.map((n) => [n.id, n]));
  const candidateNodes = new Map(
    (candidate?.nodes ?? currentDef.nodes).map((n) => [n.id, n]),
  );
  const currentEdges = new Map(currentDef.edges.map((e) => [e.id, e]));

  const currentLabel = (id: string) => labelForNode(currentNodes.get(id));
  const candidateLabel = (id: string) => labelForNode(candidateNodes.get(id));

  const changes: PatchChangeSummary[] = [];
  for (const op of operations) {
    switch (op.op) {
      case "addNode": {
        const label = resolveNodeDisplayNameFromRegistry(op.node);
        changes.push({ op: op.op, description: `Adds "${label}".`, nodeId: op.node.id });
        break;
      }
      case "updateNodeConfig": {
        const label = currentLabel(op.nodeId);
        const allKeys = Object.keys(op.config);
        const safeFields = allKeys.filter((k) => !isSecretKey(k));
        const redactedCount = allKeys.length - safeFields.length;
        const fieldsClause = safeFields.length > 0 ? ` (fields: ${safeFields.join(", ")})` : "";
        const sensitiveClause =
          redactedCount > 0 ? ` (+${redactedCount} sensitive field${redactedCount > 1 ? "s" : ""})` : "";
        changes.push({
          op: op.op,
          description: `Updates configuration for "${label}"${fieldsClause}${sensitiveClause}.`,
          nodeId: op.nodeId,
          fields: safeFields,
        });
        break;
      }
      case "removeNode": {
        changes.push({
          op: op.op,
          description: `Removes "${currentLabel(op.nodeId)}".`,
          nodeId: op.nodeId,
        });
        break;
      }
      case "addEdge": {
        changes.push({
          op: op.op,
          description: `Connects ${describeEdge(op.edge, candidateLabel, op.edge.id)}.`,
          edgeId: op.edge.id,
        });
        break;
      }
      case "removeEdge": {
        changes.push({
          op: op.op,
          description: `Removes ${describeEdge(currentEdges.get(op.edgeId), currentLabel, op.edgeId)}.`,
          edgeId: op.edgeId,
        });
        break;
      }
      case "replaceEdge": {
        const oldDesc = describeEdge(currentEdges.get(op.edgeId), currentLabel, op.edgeId);
        const newDesc = describeEdge(op.edge, candidateLabel, op.edge.id);
        changes.push({
          op: op.op,
          description: `Replaces connection ${oldDesc} with ${newDesc}.`,
          edgeId: op.edgeId,
        });
        break;
      }
      case "moveNode": {
        changes.push({
          op: op.op,
          description: `Moves "${currentLabel(op.nodeId)}".`,
          nodeId: op.nodeId,
        });
        break;
      }
      case "repairVariableReference": {
        const fieldLabel = isSecretKey(op.fieldPath) ? "a sensitive field" : `field "${op.fieldPath}"`;
        changes.push({
          op: op.op,
          description: `Repairs variable reference in ${fieldLabel} of "${currentLabel(op.nodeId)}".`,
          nodeId: op.nodeId,
          ...(isSecretKey(op.fieldPath) ? {} : { fields: [op.fieldPath] }),
        });
        break;
      }
      case "replaceTrigger": {
        const label = resolveNodeDisplayNameFromRegistry(op.node);
        changes.push({
          op: op.op,
          description: `Replaces workflow trigger with "${label}".`,
          nodeId: op.node.id,
        });
        break;
      }
    }
  }
  return changes;
}

function collectAffectedEdgeIds(operations: readonly PatchOperation[]): string[] {
  const ids = new Set<string>();
  for (const op of operations) {
    if (op.op === "addEdge") ids.add(op.edge.id);
    else if (op.op === "removeEdge") ids.add(op.edgeId);
    else if (op.op === "replaceEdge") {
      ids.add(op.edgeId);
      ids.add(op.edge.id);
    }
  }
  return [...ids];
}

/**
 * Secret-shaped config KEY names present anywhere in the patch. AI-3 surfaces
 * field key names in error/warning text (its accepted contract — values are
 * never echoed); the preview is a user-facing surface, so we additionally
 * scrub any secret-shaped key name out of surfaced messages.
 */
function collectSecretConfigKeys(operations: readonly PatchOperation[]): string[] {
  const keys = new Set<string>();
  for (const op of operations) {
    const config =
      op.op === "addNode" || op.op === "replaceTrigger"
        ? op.node.config
        : op.op === "updateNodeConfig"
          ? op.config
          : null;
    if (config) {
      for (const k of Object.keys(config)) if (isSecretKey(k)) keys.add(k);
    }
  }
  return [...keys];
}

function scrubMessage(message: string, secretKeys: readonly string[]): string {
  let out = message;
  for (const k of secretKeys) out = out.split(k).join("[sensitive field]");
  return out;
}

export async function previewWorkflowPatchForAI(
  input: PreviewWorkflowPatchInput,
): Promise<AiToolResult<PatchPreviewResult>> {
  const { userId, workflowId, patch } = input;

  // 1. Load current definition (ownership + NOT_FOUND enforced by AI-2; config
  //    arrives secret-redacted — safe for a read-only preview).
  const graphRes = await getWorkflowGraphForAI(userId, workflowId);
  if (!graphRes.ok) return graphRes;

  const currentDef: WorkflowDefinition = {
    nodes: graphRes.data.nodes.map((n) => ({
      id: n.id,
      kind: n.kind,
      provider: n.provider,
      type: n.type,
      config: n.config,
      position: n.position,
    })),
    edges: graphRes.data.edges.map((e) => ({
      id: e.id,
      from: e.from,
      to: e.to,
      ...(e.label !== undefined ? { label: e.label } : {}),
    })),
  };
  const name = graphRes.data.name;
  const currentRevision = graphRes.data.updatedAt;

  // 2. Deterministic validation (candidate, risk, cost) — never mutates input.
  //
  // Slice 4.BUILDER-NODE-IDENTITY-1 — the preview validates the patch with the
  // model's PROPOSED (patch-local) ids intact, so error/reference paths read
  // back the same ids the model reasoned about. The existing validator already
  // rejects an invented update target (UNKNOWN_NODE), a missing edge endpoint
  // (INVALID_EDGE), and duplicate ids. The system-owned id MATERIALIZATION runs
  // only at the apply persistence boundary (`applyWorkflowPatchForAI`), which is
  // always gated behind a passing preview — so persisted defs contain only
  // system ids without leaking throwaway uuids into preview copy.
  const validation = validateWorkflowPatch(patch, currentDef);
  const candidate = validation.candidateDefinition;
  const operations = patch.operations ?? [];

  // Scrub any secret-shaped config KEY name out of surfaced error/warning text.
  const secretKeys = collectSecretConfigKeys(operations);
  const safeErrors = validation.errors.map((e) => ({
    ...e,
    message: scrubMessage(e.message, secretKeys),
    ...(e.path !== undefined ? { path: isSecretKey(e.path) ? "[sensitive field]" : e.path } : {}),
  }));
  const safeWarnings = validation.warnings.map((w) => ({
    ...w,
    message: scrubMessage(w.message, secretKeys),
  }));

  // 3. Before / after explanations — pure, in-memory (no DB write of candidate).
  //    after/candidate summaries are surfaced ONLY when the patch is valid.
  const beforeSummary = explainWorkflowDefinition(currentDef, { name });
  const afterSummary =
    validation.ok && candidate ? explainWorkflowDefinition(candidate, { name }) : undefined;

  // 4. Deterministic, value-free change descriptions.
  const changes = buildChanges(operations, currentDef, candidate);
  const affectedEdgeIds = collectAffectedEdgeIds(operations);

  const candidateSummary =
    validation.ok && candidate
      ? `${candidate.nodes.length} node(s), ${candidate.edges.length} edge(s)` +
        (afterSummary?.trigger ? ` · trigger: ${afterSummary.trigger.displayName}` : " · no trigger") +
        ` · ${afterSummary?.steps.length ?? 0} action(s)`
      : undefined;

  const blockedReason = !validation.ok
    ? `${safeErrors[0]?.code ?? "INVALID_PATCH"}: ${safeErrors[0]?.message ?? "Patch is invalid."}`
    : undefined;

  const costClause = validation.taskCostEstimate
    ? ` ~${validation.taskCostEstimate.estimatedTasksPerRun} task(s)/run.`
    : "";
  const riskClause = `Risk: ${validation.riskLevel}${validation.requiresConfirmation ? " (confirmation required)" : ""}.`;
  const statusClause = validation.ok
    ? `${changes.length} change(s).`
    : `BLOCKED — ${validation.errors.length} error(s).`;
  const userFacingSummaryText = `${patch.summary} — ${statusClause} ${riskClause}${costClause}`.trim();

  return aiToolOk({
    ok: validation.ok,
    workflowId,
    currentRevision,
    patchId: patch.patchId,
    patchSummary: patch.summary,
    validation: {
      ok: validation.ok,
      errors: safeErrors,
      warnings: safeWarnings,
    },
    changes,
    affectedNodeIds: validation.affectedNodeIds,
    affectedEdgeIds,
    riskLevel: validation.riskLevel,
    requiresConfirmation: validation.requiresConfirmation,
    riskReasons: validation.riskReasons,
    ...(validation.taskCostEstimate ? { taskCostEstimate: validation.taskCostEstimate } : {}),
    beforeSummary,
    ...(afterSummary ? { afterSummary } : {}),
    ...(candidateSummary ? { candidateSummary } : {}),
    userFacingSummaryText,
    canApplyLater: validation.ok,
    ...(blockedReason ? { blockedReason } : {}),
  });
}
