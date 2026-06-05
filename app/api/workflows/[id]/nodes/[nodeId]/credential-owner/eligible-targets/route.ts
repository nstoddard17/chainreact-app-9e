import { NextResponse } from "next/server";
import { listEligibleReassignmentTargets } from "@/services/teamCredentials/credentialOwnerMetadata";
import { resolveCaller, reassignmentErrorResponse } from "../_shared";

/**
 * GET /api/workflows/[id]/nodes/[nodeId]/credential-owner/eligible-targets (CS-4b).
 *
 * Members eligible to take over this node's personal-provider credential (already
 * connected to it). Owner/admin/creator only — it reveals connection status, so a
 * plain member gets 403. Returns userId + display name + role ONLY — never a
 * token, provider account label, email, or scope. Reuses the reassignment typed-
 * reason → status mapping (feature_disabled/workflow_not_found → 404 no-leak).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; nodeId: string }> },
): Promise<Response> {
  const { id, nodeId } = await params;

  const resolved = await resolveCaller(id);
  if (!resolved.ok) return resolved.response;

  const result = await listEligibleReassignmentTargets({
    workflowId: id,
    nodeId,
    callerUserId: resolved.caller.userId,
    callerRole: resolved.caller.role,
  });
  if (!result.ok) return reassignmentErrorResponse(result.reason);

  return NextResponse.json({ members: result.members });
}
