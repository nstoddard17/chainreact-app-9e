import { NextResponse } from "next/server";
import { RecordAgentChangeRequestSchema } from "@/contracts/agentChangeHistory";
import {
  listAgentChanges,
  recordAgentChange,
} from "@/services/workflows/agentChangeHistory";
import {
  loadWorkflowForMember,
  parseJsonBody,
  requireUser,
} from "../../_shared";

/**
 * GET  /api/workflows/[id]/agent-changes — recent React Agent change history for
 *      the workflow (metadata only; value-free). AGENT-CHANGE-HISTORY-1.
 * POST /api/workflows/[id]/agent-changes — record one agent change (preview
 *      shown / applied / discarded / undone / checkpoint restored). The builder
 *      calls this from the preview lifecycle; `status` decides create-vs-update.
 *
 * Thin shell: auth → account-member gate (404 no-leak) → delegate to the service.
 * account_id + created_by_user_id are server-set, never taken from the client
 * body. RLS is the backstop on top of the explicit membership gate.
 */

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const loaded = await loadWorkflowForMember(id, auth.userId);
  if (!loaded.ok) return loaded.response;

  const items = await listAgentChanges(id);
  return NextResponse.json({ items });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const parsed = await parseJsonBody(request, RecordAgentChangeRequestSchema);
  if (!parsed.ok) return parsed.response;

  const { id } = await params;
  const loaded = await loadWorkflowForMember(id, auth.userId);
  if (!loaded.ok) return loaded.response;

  const item = await recordAgentChange({
    workflowId: id,
    accountId: loaded.record.accountId,
    createdByUserId: auth.userId,
    request: parsed.data,
  });
  return NextResponse.json(item, { status: 201 });
}
