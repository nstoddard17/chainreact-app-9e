import { NextResponse } from "next/server";
import { UpdateWorkflowRequestSchema } from "@/contracts/workflow";
import * as workflowsRepo from "@/repositories/workflows";
import { moveWorkflowToFolder } from "@/services/workflowFolders/folderService";
import { deleteWorkflow } from "@/services/workflowFolders/trashService";
import { saveDraftDefinition } from "@/services/workflows/saveDraftDefinition";
import { folderErrorResponse, trashErrorResponse } from "@/app/api/folders/_shared";
import {
  parseJsonBody,
  requireUser,
  requireWorkflowAccountMember,
  toWorkflowDetail,
  workflowNotFoundResponse,
} from "../_shared";

/**
 * GET   /api/workflows/[id] — full detail for the edit page (Slice 1H.4) /
 *                            builder UI (Slice 1I+).
 * PATCH /api/workflows/[id] — partial update. Slice 1H.4 supports only
 *                            `name`. Lifecycle transitions go through the
 *                            dedicated /activate /pause /resume /disable
 *                            endpoints; `state` is intentionally not
 *                            editable here.
 *
 * Soft-deleted workflows are 404 — even if the caller has the id and the
 * row exists, the deleted state is the "hidden" marker per
 * workflow-lifecycle.md §"Allowed states".
 */

async function loadOrNotFound(
  id: string,
  userId: string,
): Promise<
  | { ok: true; record: import("@/repositories/workflows").WorkflowRecord }
  | { ok: false; response: NextResponse }
> {
  const record = await workflowsRepo.getById(id);
  if (!record || record.state === "deleted") {
    return { ok: false, response: workflowNotFoundResponse() };
  }
  // 4.TEAM-WORKFLOWS-1 (TW-1): explicit account-membership authorization.
  // A non-member collapses to the same 404 — no existence leak.
  const authorized = await requireWorkflowAccountMember(userId, record.accountId);
  if (!authorized.ok) return authorized;
  return { ok: true, record };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const loaded = await loadOrNotFound(id, auth.userId);
  if (!loaded.ok) return loaded.response;

  return NextResponse.json(toWorkflowDetail(loaded.record));
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const parsed = await parseJsonBody(request, UpdateWorkflowRequestSchema);
  if (!parsed.ok) return parsed.response;

  const { id } = await params;
  const loaded = await loadOrNotFound(id, auth.userId);
  if (!loaded.ok) return loaded.response;

  // Slice 1I extends PATCH beyond name-only with draftDefinition. Each
  // field is independent and skipped when unchanged (no-op writes are
  // noise). Both updates land before the response — the final read of the
  // row reflects every applied change.
  let next = loaded.record;
  if (parsed.data.name !== undefined && parsed.data.name !== loaded.record.name) {
    next = await workflowsRepo.updateName(id, parsed.data.name);
  }
  if (parsed.data.draftDefinition !== undefined) {
    const definition = parsed.data.draftDefinition;
    // Shared save path: writes the draft, and if an ACTIVE workflow's ACTIVATABLE trigger
    // changed (stale trigger_resources / provider subscription), deactivates it so the
    // teardown runs and the user re-registers via Reactivate → Resume. Manual-trigger and
    // action/label/layout/edge edits stay live. The unguarded write never returns null.
    const saved = await saveDraftDefinition({
      previousState: loaded.record.state,
      previousDefinition: loaded.record.draftDefinition,
      nextDefinition: definition,
      write: () => workflowsRepo.updateDraftDefinition(id, definition),
    });
    if (saved) next = saved;
  }
  // 4.WORKFLOW-FOLDERS-3 / WF-2 — move into a folder or uncategorize (null). The
  // service validates the folder is live + same-account; the DB trigger backstops.
  if (parsed.data.folderId !== undefined) {
    const moved = await moveWorkflowToFolder({
      accountId: loaded.record.accountId,
      workflowId: id,
      folderId: parsed.data.folderId,
    });
    if (!moved.ok) return folderErrorResponse(moved);
  }
  return NextResponse.json(toWorkflowDetail(next));
}

/**
 * DELETE /api/workflows/[id] — soft-delete a workflow to Trash (WF-3).
 *
 * Stamps the trash columns (purge_after = now + 7 days, deleted_by_user_id,
 * deleted_from_folder_id, delete_operation_id) and tears down triggers via the
 * lifecycle orchestrator. The row drops out of the live list and appears in
 * Trash for 7 days. Returns the delete_operation_id for a future Undo (WF-5).
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const loaded = await loadOrNotFound(id, auth.userId);
  if (!loaded.ok) return loaded.response;

  const result = await deleteWorkflow(id, auth.userId);
  if (!result.ok) return trashErrorResponse(result);
  return NextResponse.json({
    ok: true,
    deleteOperationId: result.data.deleteOperationId,
    purgeAfter: result.data.purgeAfter,
  });
}
