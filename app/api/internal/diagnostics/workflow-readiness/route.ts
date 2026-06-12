import { NextResponse } from "next/server";
import { getByIdServiceRole } from "@/repositories/workflows";
import { isMemberServiceRole } from "@/repositories/accountMemberships";
import { getProvider } from "@/integrations/_registry";
import { checkWorkflowReadiness } from "@/services/workflows/executionReadiness";
import { applyDiagnosticsGate } from "../_shared";

/**
 * POST /api/internal/diagnostics/workflow-readiness — live, read-only workflow
 * readiness diagnosis (Slice 4.MCP-STAGE-2B-3, CS-1).
 *
 * THE route is the AUTHORIZATION CHOKEPOINT. `workflows.getByIdServiceRole` is an
 * intentionally raw, RLS-bypassing read; this route is the only caller and it
 * gates every byte:
 *   1. `applyDiagnosticsGate` first (machine bearer; default OFF → 404; prod-lock
 *      → 404; bad bearer → 401, token never echoed). No `requireUser` (no cookie).
 *   2. `getByIdServiceRole(workflowId)` (raw read; can see any account's workflow).
 *   3. `workflow === null` → `NOT_FOUND` only — reveal nothing, NO membership call.
 *   4. `isMemberServiceRole(workflow.accountId, userId)` — a NON-member gets
 *      `NO_ACCOUNT_ACCESS` and NOTHING ELSE (no readiness, node ids, node names,
 *      provider list, or any workflow detail).
 *   5. ONLY after membership passes: run the SAME `checkWorkflowReadiness` verdict
 *      the engine + builder use, and return a SANITIZED summary.
 *
 * The raw `WorkflowRecord` is NEVER spread. Node `config` (opaque, secret-bearing)
 * is NEVER read here — only the readiness verdict (graph issue codes, node ids,
 * node display names, missing-field LABELS) and a static provider inventory
 * (id / name / manifest-enabled). No config values, no tokens, no provider lookups.
 *
 * CS-1 is readiness + provider inventory ONLY. Live per-provider connection state
 * (with credential/provenance rules) is deferred to CS-2.
 */

interface GraphIssueDTO {
  readonly code: string;
  readonly nodeId?: string;
  readonly displayName?: string;
  readonly edgeId?: string;
  readonly from?: string;
  readonly to?: string;
}

interface FieldGapDTO {
  readonly nodeId: string;
  readonly nodeName: string;
  readonly missingFields: readonly string[];
}

interface ProviderInventoryDTO {
  readonly provider: string;
  readonly name: string | null;
  readonly enabled: boolean;
}

interface WorkflowReadinessDTO {
  readonly workflowId: string;
  readonly access: "OK" | "NOT_FOUND" | "NO_ACCOUNT_ACCESS";
  // ── Present ONLY when access === "OK" (an authorized member). ──
  readonly runnable?: boolean;
  readonly readinessError?: "INVALID_WORKFLOW_GRAPH" | "MISSING_REQUIRED_FIELDS" | null;
  readonly graphIssues?: readonly GraphIssueDTO[];
  readonly fieldGaps?: readonly FieldGapDTO[];
  readonly providers?: readonly ProviderInventoryDTO[];
}

const badInput = (): NextResponse =>
  NextResponse.json({ error: "invalid_input" }, { status: 400 });

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

export async function POST(request: Request): Promise<Response> {
  const gate = applyDiagnosticsGate(request);
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badInput();
  }
  if (typeof body !== "object" || body === null) return badInput();
  const b = body as Record<string, unknown>;

  const userId = typeof b.userId === "string" ? b.userId.trim() : "";
  if (!userId) return badInput();
  const workflowId = typeof b.workflowId === "string" ? b.workflowId.trim() : "";
  if (!workflowId) return badInput();

  // 1. Raw read (service-role). NON-authorizing by itself.
  const workflow = await getByIdServiceRole(workflowId);

  // 2. No row → NOT_FOUND, reveal nothing (don't even hit membership).
  if (workflow === null) {
    const dto: WorkflowReadinessDTO = { workflowId, access: "NOT_FOUND" };
    return NextResponse.json(dto);
  }

  // 3. Account-membership authz (sessionless, service-role). A non-member learns
  // only that they have no access — never the workflow's readiness or contents.
  const authorized = await isMemberServiceRole(workflow.accountId, userId);
  if (!authorized) {
    const dto: WorkflowReadinessDTO = { workflowId, access: "NO_ACCOUNT_ACCESS" };
    return NextResponse.json(dto);
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

  const dto: WorkflowReadinessDTO = {
    workflowId,
    access: "OK",
    runnable: err === null,
    readinessError: err?.error ?? null,
    graphIssues,
    fieldGaps,
    providers,
  };
  return NextResponse.json(dto);
}
