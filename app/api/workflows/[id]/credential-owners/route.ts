import { NextResponse } from "next/server";
import { buildNodeCredentialOwnerMetadata } from "@/services/teamCredentials/credentialOwnerMetadata";
import { workflowNotFoundResponse } from "@/app/api/workflows/_shared";
import { resolveCaller } from "../nodes/[nodeId]/credential-owner/_shared";

/**
 * GET /api/workflows/[id]/credential-owners (CS-4b).
 *
 * Safe, display-only per-node credential-owner metadata for the builder. Any
 * account MEMBER may read it (non-members collapse to 404 — no existence leak).
 * Flag OFF → safe empty state (`canManage:false`, no nodes). Response carries
 * display names only — never a token, provider label, email, or scope.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  const resolved = await resolveCaller(id);
  if (!resolved.ok) return resolved.response;

  const result = await buildNodeCredentialOwnerMetadata({
    workflowId: id,
    callerUserId: resolved.caller.userId,
    callerRole: resolved.caller.role,
  });
  if (!result.ok) return workflowNotFoundResponse();

  return NextResponse.json(result.metadata);
}
