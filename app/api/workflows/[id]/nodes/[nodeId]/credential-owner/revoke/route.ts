import { NextResponse } from "next/server";
import { revokeReassignment } from "@/services/teamCredentials/reassignmentService";
import { resolveCaller, reassignmentErrorResponse } from "../_shared";

/**
 * POST /api/workflows/[id]/nodes/[nodeId]/credential-owner/revoke (CS-3).
 *
 * Revoke a live (pending|accepted) grant. Allowed for owner/admin, the assigned
 * credential owner, or the workflow creator. After revoke, execution falls back
 * to the workflow creator.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; nodeId: string }> },
): Promise<Response> {
  const { id, nodeId } = await params;

  const resolved = await resolveCaller(id);
  if (!resolved.ok) return resolved.response;

  const result = await revokeReassignment({
    workflowId: id,
    nodeId,
    callerUserId: resolved.caller.userId,
    actingRole: resolved.caller.role,
  });
  if (!result.ok) return reassignmentErrorResponse(result.reason);

  return NextResponse.json({ ok: true, status: result.status });
}
