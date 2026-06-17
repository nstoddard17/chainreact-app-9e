import { getByIdServiceRole } from "@/repositories/workflows";
import { isMemberServiceRole } from "@/repositories/accountMemberships";
import { getProvider } from "@/integrations/_registry";
import { checkWorkflowReadiness } from "@/services/workflows/executionReadiness";
import type { WorkflowDefinition, WorkflowNode } from "@/contracts/workflowDefinition";
import { resolveNodeDisplayNameFromRegistry } from "@/services/ai/nodeLabel";
import { findInvalidVariableReferences } from "@/core/workflows/invalidVariableReferences";
import { findSelfLoopEdges } from "@/core/workflows/selfLoopEdges";
import { findDuplicateEdges } from "@/core/workflows/duplicateEdges";
import { getNodeSchema } from "@/services/ai/tools/providerCatalog";

/**
 * Workflow-readiness diagnostic capability (Slice 4.MCP-STAGE-2B-3 extraction).
 *
 * This is the reusable "brain" — the SOURCE OF TRUTH for "can this workflow run,
 * for this subject." It is consumed today by the gated MCP route
 * (`app/api/internal/diagnostics/workflow-readiness`) and is callable in-process
 * by the future React Agent with the same guarantees.
 *
 * Separation of concerns:
 *   - The MACHINE bearer gate (`applyDiagnosticsGate`) stays in the route — it is
 *     the MCP-adapter boundary, not a capability concern.
 *   - This service OWNS the per-account MEMBERSHIP authz (`isMemberServiceRole`),
 *     so every consumer (route or agent) inherits the same wall.
 *
 * No-leak: the raw `WorkflowRecord` is NEVER spread. Node `config` values are NOT
 * surfaced — only the readiness verdict (graph issue codes, node ids, node display
 * names, missing-field LABELS) and a STATIC provider inventory (id / name /
 * manifest-enabled). No config values, tokens, provider bodies, workflow name, or
 * `createdByUserId` ever reach the DTO.
 *
 * AI-REPAIR-3G EXCEPTION: config strings ARE scanned for broken `{{...}}` variable
 * tokens (`findInvalidVariableReferences`). Only the user-AUTHORED token text + the
 * field LABEL leave the service — never a resolved config value, secret, or any
 * non-token config content. A variable token the user typed is safe to echo back
 * (the design-time field validator already shows it inline).
 *
 * CS-1 scope: readiness verdict + provider inventory only. Live per-provider
 * connection state (with credential/provenance rules) is a separate capability.
 */

export interface GraphIssueDTO {
  readonly code: string;
  readonly nodeId?: string;
  readonly displayName?: string;
  readonly edgeId?: string;
  readonly from?: string;
  readonly to?: string;
}

export interface FieldGapDTO {
  readonly nodeId: string;
  readonly nodeName: string;
  readonly missingFields: readonly string[];
}

export interface ProviderInventoryDTO {
  readonly provider: string;
  readonly name: string | null;
  readonly enabled: boolean;
}

/**
 * Safe nodeId → human display label (AI-DIAG-FIX-1). The label is the user's
 * custom node name, else the action/trigger meta display name, else a friendly
 * title-cased type — NEVER a raw node id. Lets the render/explain/repair layers
 * refer to "Slack — Send Channel Message" instead of leaking `node:<uuid>`.
 */
export interface NodeLabelDTO {
  readonly nodeId: string;
  readonly label: string;
}

/**
 * AI-REPAIR-3G/3I — one broken (deleted-/unknown-node) variable reference found in a
 * node's config. Carries SAFE display fields plus INTERNAL navigation/compute targets:
 *   - `nodeId` — internal targeting handle (like every other finding's `nodeId`).
 *   - `fieldLabel` — display label (rendered).
 *   - `token` — the user-AUTHORED `{{...}}` token (safe; the user typed it).
 *   - `fieldKey` — the config key holding the ref. INTERNAL navigation target only
 *     (passed to `revealNode`); NEVER rendered as user-facing text (3I).
 *   - `refPath` — the broken reference's dotted path. INTERNAL — used by the agent
 *     layer to count safe upstream replacements; NEVER rendered (3I).
 * No resolved value, no secret, no non-token config.
 */
export interface InvalidVariableRefDTO {
  readonly nodeId: string;
  readonly fieldLabel: string;
  readonly token: string;
  readonly fieldKey: string;
  readonly refPath: string;
}

export interface WorkflowReadinessDTO {
  readonly workflowId: string;
  readonly access: "OK" | "NOT_FOUND" | "NO_ACCOUNT_ACCESS";
  // ── Present ONLY when access === "OK" (an authorized member). ──
  readonly runnable?: boolean;
  readonly readinessError?: "INVALID_WORKFLOW_GRAPH" | "MISSING_REQUIRED_FIELDS" | null;
  readonly graphIssues?: readonly GraphIssueDTO[];
  readonly fieldGaps?: readonly FieldGapDTO[];
  readonly providers?: readonly ProviderInventoryDTO[];
  /** nodeId → safe display label for every node in the diagnosed graph. */
  readonly nodeLabels?: readonly NodeLabelDTO[];
  /**
   * AI-REPAIR-3G — broken (deleted-/unknown-node) variable references in node
   * configs. Non-empty means at least one field points at a step that no longer
   * exists, so the workflow is NOT actually ready even when the engine's
   * `checkWorkflowReadiness` graph/field verdict is clean. Empty/absent → none.
   */
  readonly invalidVariableRefs?: readonly InvalidVariableRefDTO[];
  /**
   * AI-REPAIR-COVERAGE-1 — self-loop edges (a connection from a step to itself).
   * Check-only: detected here (diagnosis), NOT in the shared runtime validator, so
   * it never changes the engine's `runnable` / the Activate gate. Each carries the
   * internal looping `nodeId` (for safe label resolution); `edgeId` stays server-side
   * — the deterministic `removeEdge` repair re-derives it from the graph. Empty/absent
   * → none.
   */
  readonly selfLoopEdges?: readonly { readonly nodeId: string }[];
  /**
   * AI-REPAIR-COVERAGE-2 — redundant duplicate edges (two-or-more edges identical by the
   * graph's own key `(from, to, label ?? "")`). Check-only: detected here (diagnosis), NOT
   * in the shared runtime validator, so it never changes the engine's `runnable` / the
   * Activate gate. Each carries the redundant copy's `fromNodeId` / `toNodeId` (for safe
   * label resolution); the `edgeId` stays server-side — the deterministic `removeEdge`
   * repair re-derives it from the graph. Same-`(from,to)`-different-`label` (distinct
   * branches) are NEVER included. Empty/absent → none.
   */
  readonly duplicateEdges?: readonly {
    readonly fromNodeId: string;
    readonly toNodeId: string;
  }[];
}

/**
 * Resolve a SAFE field label for a config key from the node's registry schema.
 * Falls back to the raw key (itself a non-secret field NAME, never a value) when
 * the schema or field can't be resolved.
 */
function resolveFieldLabel(node: WorkflowNode, fieldKey: string): string {
  if (!node.type) return fieldKey;
  const schema = getNodeSchema(`${node.provider}:${node.type}`);
  if (!schema.ok) return fieldKey;
  const field = schema.data.fields.find((f) => f.name === fieldKey);
  return field?.label ?? fieldKey;
}

/** Scan node configs for broken variable tokens → safe display DTOs (no values). */
function buildInvalidVariableRefs(
  nodes: readonly WorkflowNode[],
): InvalidVariableRefDTO[] {
  const nodesById = new Map(nodes.map((n) => [n.id, n]));
  return findInvalidVariableReferences(nodes).map((ref) => ({
    nodeId: ref.nodeId,
    fieldLabel: nodesById.has(ref.nodeId) ? resolveFieldLabel(nodesById.get(ref.nodeId)!, ref.fieldKey) : ref.fieldKey,
    token: ref.token,
    fieldKey: ref.fieldKey,
    refPath: ref.refPath,
  }));
}

/** Build the nodeId → safe display-label inventory for the diagnosed graph. */
function buildNodeLabels(
  nodes: ReadonlyArray<{
    id: string;
    kind: "trigger" | "action";
    provider: string;
    type: string;
    displayName?: string;
  }>,
): NodeLabelDTO[] {
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

/** Distinct provider ids in the draft graph → static manifest inventory (no DB). */
function buildProviderInventory(
  nodes: ReadonlyArray<{ provider: string }>,
): ProviderInventoryDTO[] {
  const seen = new Set<string>();
  const out: ProviderInventoryDTO[] = [];
  for (const node of nodes) {
    const provider = node.provider;
    if (!provider || seen.has(provider)) continue;
    seen.add(provider);
    const manifest = getProvider(provider);
    out.push({
      provider,
      name: manifest?.displayName ?? null,
      enabled: manifest?.isEnabled ?? false,
    });
  }
  return out;
}

/**
 * Diagnose a workflow's readiness for a subject. Owns the raw read, membership
 * authz, the engine's own `checkWorkflowReadiness` verdict, the provider
 * inventory, and sanitized DTO assembly. Returns a discriminated DTO the caller
 * serializes verbatim.
 */
export async function diagnoseWorkflowReadiness(input: {
  subjectUserId: string;
  workflowId: string;
  /**
   * AI-DIAG-FIX-1 — the client's CURRENT builder draft (unsaved edits), validated
   * upstream. When present the readiness verdict + inventories are computed against
   * it instead of the saved `draftDefinition`, so "Check workflow" matches the
   * canvas. Authorization still comes from the SAVED workflow record below — the
   * override only changes WHICH graph is analyzed, never WHO may analyze it. Never
   * persisted.
   */
  draftOverride?: WorkflowDefinition;
}): Promise<WorkflowReadinessDTO> {
  const { subjectUserId, workflowId } = input;

  // 1. Raw read (service-role). NON-authorizing by itself.
  const workflow = await getByIdServiceRole(workflowId);

  // 2. No row → NOT_FOUND, reveal nothing (don't even hit membership).
  if (workflow === null) {
    return { workflowId, access: "NOT_FOUND" };
  }

  // 3. Account-membership authz (sessionless, service-role). A non-member learns
  // only that they have no access — never the workflow's readiness or contents.
  const authorized = await isMemberServiceRole(workflow.accountId, subjectUserId);
  if (!authorized) {
    return { workflowId, access: "NO_ACCOUNT_ACCESS" };
  }

  // 4. Authorized member → the SAME readiness verdict the engine + builder use.
  // AI-DIAG-FIX-1: diagnose the client's current builder draft when supplied
  // (unsaved edits), else the saved definition. Authz already passed on the saved
  // record above; the override changes only WHICH graph is analyzed.
  const def = input.draftOverride ?? workflow.draftDefinition;
  const err = checkWorkflowReadiness(def);
  const providers = buildProviderInventory(def.nodes);
  const nodeLabels = buildNodeLabels(def.nodes);

  const graphIssues: GraphIssueDTO[] =
    err?.error === "INVALID_WORKFLOW_GRAPH"
      ? err.graph.map((g) => ({
          code: g.code,
          ...(g.nodeId !== undefined && { nodeId: g.nodeId }),
          ...(g.displayName !== undefined && { displayName: g.displayName }),
          ...(g.edgeId !== undefined && { edgeId: g.edgeId }),
          ...(g.from !== undefined && { from: g.from }),
          ...(g.to !== undefined && { to: g.to }),
        }))
      : [];

  const fieldGaps: FieldGapDTO[] =
    err?.error === "MISSING_REQUIRED_FIELDS"
      ? err.nodes.map((n) => ({
          nodeId: n.nodeId,
          nodeName: n.displayName,
          missingFields: n.missingFields,
        }))
      : [];

  const invalidVariableRefs = buildInvalidVariableRefs(def.nodes);
  // AI-REPAIR-COVERAGE-1 — Check-only self-loop detection (does NOT feed `runnable`).
  const selfLoopEdges = findSelfLoopEdges(def.edges).map((s) => ({ nodeId: s.nodeId }));
  // AI-REPAIR-COVERAGE-2 — Check-only redundant-duplicate-edge detection (does NOT feed
  // `runnable`). Keyed on (from, to, label ?? "") so distinct branches are never flagged.
  const duplicateEdges = findDuplicateEdges(def.edges).map((d) => ({
    fromNodeId: d.fromNodeId,
    toNodeId: d.toNodeId,
  }));

  return {
    workflowId,
    access: "OK",
    runnable: err === null,
    readinessError: err?.error ?? null,
    graphIssues,
    fieldGaps,
    providers,
    nodeLabels,
    invalidVariableRefs,
    selfLoopEdges,
    duplicateEdges,
  };
}
