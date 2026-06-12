import { NextResponse } from "next/server";
import * as workflowsRepo from "@/repositories/workflows";
import { restoreWorkflow } from "@/services/workflowFolders/trashService";
import { trashErrorResponse } from "@/app/api/folders/_shared";
import {
  requireUser,
  requireWorkflowAccountMember,
  toWorkflowDetail,
  workflowNotFoundResponse,
} from "../../_shared";

/**
 * POST /api/workflows/[id]/restore — restore a trashed workflow (WF-3).
 *
 * Returns the workflow to `draft` (inactive) and relocates it to its original
 * folder if that folder is still live, else to uncategorized. Restore NEVER
 * re-registers triggers — the user re-activates explicitly.
 *
 * Unlike GET/PATCH (which 404 on deleted rows), restore loads the deleted row
 * directly: deleted IS the valid target. A non-member sees null via RLS → 404
 * (no existence leak).
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const record = await workflowsRepo.getById(id);
  if (!record) return workflowNotFoundResponse();

  const authorized = await requireWorkflowAccountMember(auth.userId, record.accountId);
  if (!authorized.ok) return authorized.response;

  const result = await restoreWorkflow(id);
  if (!result.ok) return trashErrorResponse(result);

  const restored = await workflowsRepo.getById(id);
  return NextResponse.json(restored ? toWorkflowDetail(restored, auth.userId) : { ok: true });
}
