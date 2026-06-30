import { NextResponse } from "next/server";
import { restoreCheckpoint } from "@/services/workflows/checkpoints";
import { workflowUsesPrivateCredential } from "@/core/integrations/workflowCredentialScope";
import {
  loadWorkflowForMember,
  requireUser,
  toWorkflowDetail,
  workflowUsesPrivateCredentialResponse,
} from "../../../../_shared";

/**
 * POST /api/workflows/[id]/checkpoints/[checkpointId]/restore — restore a draft
 * checkpoint: write its captured definition as the workflow's new draft and
 * return the updated detail (CHECKPOINTS-1).
 *
 * Thin shell: auth → account-member gate (404 no-leak) → credential-bound edit
 * gate (mirrors PATCH /api/workflows/[id]: a non-creator may not write the draft
 * of a private-credential workflow) → delegate to the checkpoints service, which
 * routes through the shared saveDraftDefinition path so an active-trigger change
 * deactivates exactly as a normal save would.
 */

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; checkpointId: string }> },
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const { id, checkpointId } = await params;
  const loaded = await loadWorkflowForMember(id, auth.userId);
  if (!loaded.ok) return loaded.response;

  // WF-RUNPERM parity with PATCH: restoring rewrites the draft definition, so a
  // non-creator may not restore a private-credential workflow.
  const isCreator =
    loaded.record.createdByUserId !== null &&
    loaded.record.createdByUserId === auth.userId;
  if (!isCreator && workflowUsesPrivateCredential(loaded.record.draftDefinition)) {
    return workflowUsesPrivateCredentialResponse();
  }

  const result = await restoreCheckpoint({
    workflow: loaded.record,
    checkpointId,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: "Checkpoint not found.", code: "CHECKPOINT_NOT_FOUND" },
      { status: 404 },
    );
  }
  return NextResponse.json(await toWorkflowDetail(result.record, auth.userId));
}
