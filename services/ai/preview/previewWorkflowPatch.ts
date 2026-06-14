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
import { formatTypeKey } from "@/core/workflows/nodeDisplayName";
import { humanizePatchError } from "@/core/errors/humanizePatchError";
import { isSecretKey, redactSecrets } from "@/services/ai/tools/redact";
import { getWorkflowGraphForAI } from "@/services/ai/tools/workflowContext";
import { aiToolOk, type AiToolResult } from "@/services/ai/tools/types";
import { explainWorkflowDefinition } from "@/services/ai/explain/explainDefinition";
import { resolveNodeDisplayNameFromRegistry } from "@/services/ai/nodeLabel";
import { getNodeSchema } from "@/services/ai/tools/providerCatalog";
import { normalizeAiPatchNodeKeys } from "@/services/ai/patch/normalizeAiPatchNodeKeys";
import { validateWorkflowPatch } from "@/services/workflows/patch/validateWorkflowPatch";
import type { PatchOperation, PatchValidationError } from "@/services/workflows/patch/types";
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

/**
 * Build a friendly subject (e.g. `Gmail 'New Email'`) for an UNKNOWN_TRIGGER /
 * UNKNOWN_ACTION error by locating the offending addNode / replaceTrigger node
 * in the patch. Title-cases provider + type — stripping a self-prefix
 * defensively — so a raw or doubled `provider:type` key never reaches user copy.
 * Returns undefined when the node can't be resolved (humanizer uses generic copy).
 */
function subjectForError(
  error: PatchValidationError,
  operations: readonly PatchOperation[],
): string | undefined {
  if (error.code !== "UNKNOWN_TRIGGER" && error.code !== "UNKNOWN_ACTION") return undefined;
  if (!error.nodeId) return undefined;
  for (const op of operations) {
    const node = op.op === "addNode" || op.op === "replaceTrigger" ? op.node : undefined;
    if (!node || node.id !== error.nodeId) continue;
    const prefix = `${node.provider}:`;
    const type = node.type.startsWith(prefix) ? node.type.slice(prefix.length) : node.type;
    const providerLabel = formatTypeKey(node.provider);
    const typeLabel = formatTypeKey(type);
    if (!typeLabel) return providerLabel || undefined;
    return providerLabel ? `${providerLabel} '${typeLabel}'` : `'${typeLabel}'`;
  }
  return undefined;
}

/**
 * Resolve the friendly FieldMeta `label` for one config field of a node, by its
 * raw field KEY. Returns undefined when the node type or field isn't in the
 * registry — the humanizer then falls back to generic, key-free copy. NEVER
 * returns the raw key.
 */
function resolveFieldLabel(node: WorkflowNode, fieldName: string): string | undefined {
  const schema = getNodeSchema(`${node.provider}:${node.type}`);
  if (!schema.ok) return undefined;
  return schema.data.fields.find((f) => f.name === fieldName)?.label;
}

/**
 * Build friendly field + node labels for a config-family validation error
 * (MISSING_REQUIRED_FIELD / INVALID_CONFIG) so user-facing copy reads e.g.
 * `Required field “Message” is missing on “Send Channel Message.”` instead of
 * leaking the raw field key (`text`) or the `provider:type` key
 * (`slack:send_channel_message`). Resolves the offending node from the
 * candidate/current graph (or the patch's add/replace ops) and the field label
 * from registry FieldMeta. A secret-shaped field key resolves to no fieldLabel
 * so the humanizer uses generic copy. Returns {} for non-config-family codes.
 */
function configErrorLabels(
  error: PatchValidationError,
  nodeById: Map<string, WorkflowNode>,
): { fieldLabel?: string; nodeLabel?: string } {
  if (error.code !== "MISSING_REQUIRED_FIELD" && error.code !== "INVALID_CONFIG") return {};
  if (!error.nodeId) return {};
  const node = nodeById.get(error.nodeId);
  if (!node) return {};
  const nodeLabel = resolveNodeDisplayNameFromRegistry(node);
  const fieldName = error.path;
  const fieldLabel =
    fieldName && !isSecretKey(fieldName) ? resolveFieldLabel(node, fieldName) : undefined;
  return {
    ...(fieldLabel ? { fieldLabel } : {}),
    ...(nodeLabel ? { nodeLabel } : {}),
  };
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
  const { userId, workflowId, patch, draftDefinition } = input;

  // 1. Load the saved record (ownership + NOT_FOUND enforced by AI-2; config
  //    arrives secret-redacted). Authz, workflow name, and the revision token
  //    ALWAYS come from the saved load — never from a client-supplied draft.
  const graphRes = await getWorkflowGraphForAI(userId, workflowId);
  if (!graphRes.ok) return graphRes;

  const savedDef: WorkflowDefinition = {
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

  // AI-REPAIR-2b — when a TRUSTED, already-validated current-draft snapshot is
  // supplied, the patch is validated/previewed against THAT (the unsaved canvas
  // the user sees, matching what the diagnosis used) instead of the saved
  // definition. Secrets are redacted for parity with the saved path; the draft is
  // used in-memory ONLY — never persisted, never written back. Absent → saved def.
  const currentDef: WorkflowDefinition = draftDefinition
    ? redactSecrets(draftDefinition)
    : savedDef;
  const name = graphRes.data.name;
  const currentRevision = graphRes.data.updatedAt;

  // Slice 4.PROVIDER-CATALOG-INTEGRITY-1 — correct a self-qualified node key
  // (e.g. the planner put `gmail:new_email` in `type`) BEFORE validation so a
  // supported trigger/action resolves against its real registry key. Strict:
  // only strips a `<provider>:` prefix that equals the node's own provider;
  // genuinely-unknown nodes still reject. Envelope unchanged.
  const effectivePatch = normalizeAiPatchNodeKeys(patch);

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
  const validation = validateWorkflowPatch(effectivePatch, currentDef);
  const candidate = validation.candidateDefinition;
  const operations = effectivePatch.operations ?? [];

  // Scrub any secret-shaped config KEY name out of surfaced error/warning text.
  const secretKeys = collectSecretConfigKeys(operations);

  // Node lookup for resolving friendly field/node labels in config-family error
  // copy. Candidate carries the merged (post-patch) node; fall back to the
  // current graph and the patch's add/replace nodes. Used only to read display
  // labels — node ids never reach user copy.
  const nodeById = new Map<string, WorkflowNode>();
  for (const n of currentDef.nodes) nodeById.set(n.id, n);
  for (const n of candidate?.nodes ?? []) nodeById.set(n.id, n);
  for (const op of operations) {
    if (op.op === "addNode" || op.op === "replaceTrigger") nodeById.set(op.node.id, op.node);
  }

  // Slice 4.PROVIDER-CATALOG-INTEGRITY-1 + AI-REPAIR-2D — humanize user-facing
  // copy: no raw provider:type keys, no field KEYS, no node ids, no
  // "registered"/"V2" backend language. The raw message stays as the error's
  // dev detail; only the displayed `message` is rewritten. The secret-key scrub
  // runs FIRST so a code we don't humanize still passes through scrubbed; the
  // humanizer context is resolved from the ORIGINAL error (real ids/keys), which
  // never leak — they only drive registry lookups for the friendly labels.
  const userFacingErrors: PatchValidationError[] = validation.errors.map((e) => {
    const scrubbedPath =
      e.path !== undefined ? (isSecretKey(e.path) ? "[sensitive field]" : e.path) : undefined;
    const scrubbed: PatchValidationError = {
      ...e,
      message: scrubMessage(e.message, secretKeys),
      ...(scrubbedPath !== undefined ? { path: scrubbedPath } : {}),
    };
    const subject = subjectForError(e, operations);
    const { fieldLabel, nodeLabel } = configErrorLabels(e, nodeById);
    const { message } = humanizePatchError(scrubbed, {
      ...(subject ? { subject } : {}),
      ...(fieldLabel ? { fieldLabel } : {}),
      ...(nodeLabel ? { nodeLabel } : {}),
    });
    return { ...scrubbed, message };
  });
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
    ? userFacingErrors[0]?.message ?? "This change can't be applied as-is."
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
      errors: userFacingErrors,
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
