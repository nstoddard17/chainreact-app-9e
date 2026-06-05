import { NextResponse } from "next/server";
import { acceptReassignment } from "@/services/teamCredentials/reassignmentService";
import { resolveCaller, reassignmentErrorResponse } from "../_shared";

/**
 * POST /api/workflows/[id]/nodes/[nodeId]/credential-owner/accept (CS-3).
 *
 * The TARGET member consents — makes the pending grant effective (CS-2 execution
 * uses it when the flag is ON). Re-checks membership + an active connection. Only
 * the assigned target may accept.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; nodeId: string }> },
): Promise<Response> {
  const { id, nodeId } = await params;

  const resolved = await resolveCaller(id);
  if (!resolved.ok) return resolved.response;

  const result = await acceptReassignment({
    workflowId: id,
    nodeId,
    callerUserId: resolved.caller.userId,
  });
  if (!result.ok) return reassignmentErrorResponse(result.reason);

  return NextResponse.json({ ok: true, status: result.status });
}
