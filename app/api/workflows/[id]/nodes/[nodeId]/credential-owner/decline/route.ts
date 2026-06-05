import { NextResponse } from "next/server";
import { declineReassignment } from "@/services/teamCredentials/reassignmentService";
import { resolveCaller, reassignmentErrorResponse } from "../_shared";

/**
 * POST /api/workflows/[id]/nodes/[nodeId]/credential-owner/decline (CS-3).
 *
 * The TARGET member declines a pending request. Execution stays creator-pinned.
 * Only the assigned target may decline.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; nodeId: string }> },
): Promise<Response> {
  const { id, nodeId } = await params;

  const resolved = await resolveCaller(id);
  if (!resolved.ok) return resolved.response;

  const result = await declineReassignment({
    workflowId: id,
    nodeId,
    callerUserId: resolved.caller.userId,
  });
  if (!result.ok) return reassignmentErrorResponse(result.reason);

  return NextResponse.json({ ok: true, status: result.status });
}
