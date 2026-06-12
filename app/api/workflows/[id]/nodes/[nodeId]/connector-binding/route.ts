import { NextResponse } from "next/server";
import {
  setNodeConnectorBinding,
  clearNodeConnectorBinding,
  getNodeConnectorBindingState,
} from "@/services/integrations/connectionBinding";
import { resolveCaller, connectorBindingErrorResponse } from "./_shared";

/**
 * GET /api/workflows/[id]/nodes/[nodeId]/connector-binding (Slice 4.CONN-SHARE / CS-5b)
 *
 * The builder's per-node binding state: `{ status, connectors, currentConnectorDisplayName }`.
 * Editor-gated; no-leak (status enum + safe `{userId, displayName, role}` options +
 * a display name only). not_enabled / non-member collapse to 404.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; nodeId: string }> },
): Promise<Response> {
  const { id, nodeId } = await params;

  const resolved = await resolveCaller(id);
  if (!resolved.ok) return resolved.response;

  const result = await getNodeConnectorBindingState({
    workflowId: id,
    nodeId,
    callerUserId: resolved.caller.userId,
    callerRole: resolved.caller.role,
  });
  if (!result.ok) return connectorBindingErrorResponse(result.reason);

  return NextResponse.json({
    status: result.status,
    connectors: result.connectors,
    currentConnectorDisplayName: result.currentConnectorDisplayName,
  });
}

/**
 * PUT/DELETE /api/workflows/[id]/nodes/[nodeId]/connector-binding
 * (Slice 4.CONN-SHARE / CS-4a)
 *
 * PUT sets the node's connector binding to `{ connectorUserId }`; DELETE clears
 * it. Thin: authenticate + membership-gate via `resolveCaller` → call the service
 * → map typed failures. The service is the single authorization chokepoint
 * (flag → workflow → node → provider class → frozen → editor → connector must be
 * a member + connected + in the live shared set) and the only writer. The route
 * never touches a service-role client and never sees a token or raw error.
 *
 * BEHAVIOR-INERT: the stored binding is not yet consulted by the resolver or the
 * run/edit gate (CS-4b). No-leak: not_enabled / workflow_not_found / non-member
 * all collapse to 404; success bodies carry only booleans.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; nodeId: string }> },
): Promise<Response> {
  const { id, nodeId } = await params;

  const resolved = await resolveCaller(id);
  if (!resolved.ok) return resolved.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const connectorUserId = (body as { connectorUserId?: unknown } | null)?.connectorUserId;
  if (typeof connectorUserId !== "string" || connectorUserId.length === 0) {
    return NextResponse.json(
      { error: "A connector must be selected.", code: "INVALID_CONNECTOR" },
      { status: 400 },
    );
  }

  const result = await setNodeConnectorBinding({
    workflowId: id,
    nodeId,
    connectorUserId,
    callerUserId: resolved.caller.userId,
    callerRole: resolved.caller.role,
  });
  if (!result.ok) return connectorBindingErrorResponse(result.reason);

  return NextResponse.json({ bound: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; nodeId: string }> },
): Promise<Response> {
  const { id, nodeId } = await params;

  const resolved = await resolveCaller(id);
  if (!resolved.ok) return resolved.response;

  const result = await clearNodeConnectorBinding({
    workflowId: id,
    nodeId,
    callerUserId: resolved.caller.userId,
    callerRole: resolved.caller.role,
  });
  if (!result.ok) return connectorBindingErrorResponse(result.reason);

  return NextResponse.json({ cleared: result.cleared });
}
