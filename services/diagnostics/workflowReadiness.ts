import { getByIdServiceRole } from "@/repositories/workflows";
import { isMemberServiceRole } from "@/repositories/accountMemberships";
import { getProvider } from "@/integrations/_registry";
import { checkWorkflowReadiness } from "@/services/workflows/executionReadiness";

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
 * No-leak: the raw `WorkflowRecord` is NEVER spread. Node `config` (opaque,
 * secret-bearing) is NEVER read — only the readiness verdict (graph issue codes,
 * node ids, node display names, missing-field LABELS) and a STATIC provider
 * inventory (id / name / manifest-enabled). No config values, tokens, provider
 * bodies, workflow name, or `createdByUserId` ever reach the DTO.
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

export interface WorkflowReadinessDTO {
  readonly workflowId: string;
  readonly access: "OK" | "NOT_FOUND" | "NO_ACCOUNT_ACCESS";
  // ── Present ONLY when access === "OK" (an authorized member). ──
  readonly runnable?: boolean;
  readonly readinessError?: "INVALID_WORKFLOW_GRAPH" | "MISSING_REQUIRED_FIELDS" | null;
  readonly graphIssues?: readonly GraphIssueDTO[];
  readonly fieldGaps?: readonly FieldGapDTO[];
  readonly providers?: readonly ProviderInventoryDTO[];
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
  const err = checkWorkflowReadiness(workflow.draftDefinition);
  const providers = buildProviderInventory(workflow.draftDefinition.nodes);

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

  return {
    workflowId,
    access: "OK",
    runnable: err === null,
    readinessError: err?.error ?? null,
    graphIssues,
    fieldGaps,
    providers,
  };
}
