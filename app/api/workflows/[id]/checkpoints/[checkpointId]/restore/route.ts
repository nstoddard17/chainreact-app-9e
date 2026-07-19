import { NextResponse } from "next/server";
import { restoreCheckpoint } from "@/services/workflows/checkpoints";
import {
  isPlanFeatureRequiredError,
  planFeatureRequiredBody,
} from "@/services/workflows/planFeatureGate";
import { workflowUsesPrivateCredential } from "@/core/integrations/workflowCredentialScope";
import { LifecycleError } from "@/core/workflows/lifecycle";
import {
  lifecycleErrorResponse,
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

  try {
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
  } catch (err) {
    // Restoring an OLDER draft over an ACTIVE workflow can change the activatable trigger set, so
    // the shared save path tears down the stale registration via the lifecycle orchestrator — which
    // throws a typed LifecycleError on a teardown/registration problem. Map it through the SAME
    // helper the lifecycle routes use (typed 4xx/502 + stable code, no provider/identifier leak).
    if (err instanceof LifecycleError) {
      return lifecycleErrorResponse(err);
    }
    // BRANCH-ENT-1 C5 — the checkpoint's definition uses advanced branching
    // and the owning account is no longer entitled (e.g. downgraded since the
    // checkpoint was taken). Typed 403; the current draft is untouched.
    if (isPlanFeatureRequiredError(err)) {
      return NextResponse.json(planFeatureRequiredBody(err), { status: 403 });
    }
    // Any other throw (DB error, credential-plan read, etc.) must NEVER reach the client as a raw
    // 500 carrying an internal message/stack. Log the raw error server-side ONLY, and return a
    // stable, identifier-free body the UI can show verbatim (mirrors the runLifecycle boundary).
    console.error(
      JSON.stringify({
        event: "workflow.checkpoint.restore_failed",
        message: err instanceof Error ? err.message : String(err),
      }),
    );
    return NextResponse.json(
      {
        error: "Couldn't restore this checkpoint. Refresh and try again.",
        code: "CHECKPOINT_RESTORE_FAILED",
      },
      { status: 500 },
    );
  }
}
