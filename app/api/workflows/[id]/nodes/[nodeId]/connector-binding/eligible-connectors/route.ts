import { NextResponse } from "next/server";
import { listEligibleSharedConnectors } from "@/services/integrations/connectionBinding";
import { resolveCaller, connectorBindingErrorResponse } from "../_shared";

/**
 * GET /api/workflows/[id]/nodes/[nodeId]/connector-binding/eligible-connectors
 * (Slice 4.CONN-SHARE / CS-4a)
 *
 * The safe picker: members whose personal connection for this node's provider is
 * explicitly `shared_with_account`. Editor-gated (the service applies the
 * owner/admin-or-creator rule). Returns `{ userId, displayName, role }` ONLY —
 * never a token, provider account label, email, scope, or account metadata.
 * Reuses the exact shape of the credential-owner eligible-targets endpoint.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; nodeId: string }> },
): Promise<Response> {
  const { id, nodeId } = await params;

  const resolved = await resolveCaller(id);
  if (!resolved.ok) return resolved.response;

  const result = await listEligibleSharedConnectors({
    workflowId: id,
    nodeId,
    callerUserId: resolved.caller.userId,
    callerRole: resolved.caller.role,
  });
  if (!result.ok) return connectorBindingErrorResponse(result.reason);

  return NextResponse.json({ connectors: result.connectors });
}
