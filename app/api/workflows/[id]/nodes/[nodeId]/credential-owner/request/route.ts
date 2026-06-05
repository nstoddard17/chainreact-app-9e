import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody } from "@/app/api/workflows/_shared";
import { requestReassignment } from "@/services/teamCredentials/reassignmentService";
import { resolveCaller, reassignmentErrorResponse } from "../_shared";

/**
 * POST /api/workflows/[id]/nodes/[nodeId]/credential-owner/request (CS-3).
 *
 * Owner/admin (or the workflow creator) requests that a personal-provider node
 * run under `targetUserId`'s connection. Creates a PENDING grant — inert until
 * the target accepts. Response carries no labels/emails/tokens.
 */

const RequestBodySchema = z.object({
  targetUserId: z.string().min(1),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; nodeId: string }> },
): Promise<Response> {
  const { id, nodeId } = await params;

  const resolved = await resolveCaller(id);
  if (!resolved.ok) return resolved.response;

  const body = await parseJsonBody(request, RequestBodySchema);
  if (!body.ok) return body.response;

  const result = await requestReassignment({
    workflowId: id,
    nodeId,
    targetUserId: body.data.targetUserId,
    callerUserId: resolved.caller.userId,
    actingRole: resolved.caller.role,
  });
  if (!result.ok) return reassignmentErrorResponse(result.reason);

  return NextResponse.json({ ok: true, status: result.status });
}
