import { NextResponse } from "next/server";
import * as foldersRepo from "@/repositories/workflowFolders";
import { restoreFolder } from "@/services/workflowFolders/trashService";
import {
  authorizeFolderAccess,
  folderNotFoundResponse,
  requireUser,
  trashErrorResponse,
} from "../../_shared";

/**
 * POST /api/folders/[id]/restore — restore a trashed folder (WF-3).
 *
 * Restores the entire delete_operation_id batch the folder belongs to (so a
 * folder trashed with its contents comes back as a whole subtree). Parents are
 * restored before children; any folder/workflow whose original parent is gone
 * lands at the root / uncategorized. A non-member sees null via RLS → 404.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const folder = await foldersRepo.getById(id);
  if (!folder) return folderNotFoundResponse();

  const authorized = await authorizeFolderAccess(auth.userId, folder.accountId);
  if (!authorized.ok) return authorized.response;

  const result = await restoreFolder(id);
  if (!result.ok) return trashErrorResponse(result);
  return NextResponse.json({ ok: true, ...result.data });
}
