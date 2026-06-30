import { NextResponse } from "next/server";
import { z } from "zod";
import { WorkflowDefinitionSchema } from "@/contracts/workflowDefinition";
import { diagnoseWorkflowConnections } from "@/services/diagnostics/integrationConnection";
import { loadWorkflowForMember, parseJsonBody, requireUser } from "../../_shared";

/**
 * POST /api/workflows/[id]/connection-readiness — session-authenticated preview of
 * the workflow's per-provider connection readiness (REACT-AGENT-READINESS-1).
 *
 * Reuses the SAME authoritative brain the gated MCP route uses
 * (`diagnoseWorkflowConnections`) — the source of truth for "is every provider this
 * graph uses connected & usable, under the V2 account + credential-provenance
 * walls" (integration rows / health / scopes). This route is the COOKIE-session
 * front door for the builder's React Agent readiness panel; the machine-bearer
 * gated `/api/internal/diagnostics/workflow-connections` route is unchanged.
 *
 * Thin shell: auth → account-member gate (404 no-leak) → delegate. The body may
 * carry the client's CURRENT draft (the React Agent's proposed end-state, or the
 * live pending draft) as `draftOverride`, so readiness reflects the change being
 * reviewed rather than the saved definition. The brain re-derives authorization
 * from the SAVED record, so the override only changes WHICH providers are
 * inspected — never WHO may inspect them.
 *
 * The brain's DTO is already sanitized (enums / counts / booleans / node ids /
 * public scope-gap names only — never tokens, connectedByUserId, providerAccountId,
 * displayName, accountMetadata, or node config values); it is serialized verbatim.
 */

const RequestSchema = z.object({
  draftOverride: WorkflowDefinitionSchema.optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const parsed = await parseJsonBody(request, RequestSchema);
  if (!parsed.ok) return parsed.response;

  const { id } = await params;
  // Defense-in-depth membership gate (standard 404 no-leak). The brain ALSO
  // re-authorizes by account membership, so a non-member never reaches it.
  const loaded = await loadWorkflowForMember(id, auth.userId);
  if (!loaded.ok) return loaded.response;

  const result = await diagnoseWorkflowConnections({
    subjectUserId: auth.userId,
    workflowId: id,
    ...(parsed.data.draftOverride ? { draftOverride: parsed.data.draftOverride } : {}),
  });
  return NextResponse.json(result);
}
