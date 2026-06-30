import { NextResponse } from "next/server";
import { CreateWorkflowCheckpointRequestSchema } from "@/contracts/workflowCheckpoint";
import {
  createCheckpoint,
  listCheckpoints,
} from "@/services/workflows/checkpoints";
import {
  loadWorkflowForMember,
  parseJsonBody,
  requireUser,
} from "../../_shared";

/**
 * GET  /api/workflows/[id]/checkpoints — recent draft restore points (metadata
 *      only; the snapshot stays server-side until restore). CHECKPOINTS-1.
 * POST /api/workflows/[id]/checkpoints — create a checkpoint capturing the
 *      supplied PRE-change draft snapshot. The React Agent apply flow calls this
 *      before mutating the local draft so the user can go back.
 *
 * Thin shell: auth → account-member gate (404 no-leak) → delegate to the
 * checkpoints service. account_id + created_by_user_id are server-set, never
 * taken from the client body.
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

  const checkpoints = await listCheckpoints(id);
  return NextResponse.json({ checkpoints });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const parsed = await parseJsonBody(request, CreateWorkflowCheckpointRequestSchema);
  if (!parsed.ok) return parsed.response;

  const { id } = await params;
  const loaded = await loadWorkflowForMember(id, auth.userId);
  if (!loaded.ok) return loaded.response;

  const checkpoint = await createCheckpoint({
    workflowId: id,
    accountId: loaded.record.accountId,
    createdByUserId: auth.userId,
    source: parsed.data.source,
    name: parsed.data.name,
    ...(parsed.data.prompt !== undefined ? { prompt: parsed.data.prompt } : {}),
    ...(parsed.data.summary !== undefined ? { summary: parsed.data.summary } : {}),
    definition: parsed.data.definition,
  });
  return NextResponse.json(checkpoint, { status: 201 });
}
