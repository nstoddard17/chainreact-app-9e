import { NextResponse } from "next/server";
import * as foldersRepo from "@/repositories/workflowFolders";
import { UpdateFolderRequestSchema } from "@/contracts/folders";
import { moveFolder, renameFolder } from "@/services/workflowFolders/folderService";
import {
  authorizeFolderAccess,
  folderErrorResponse,
  folderNotFoundResponse,
  parseJsonBody,
  requireUser,
  toWorkflowFolder,
} from "../_shared";

/**
 * PATCH /api/folders/[id] — rename and/or move a folder.
 *
 * Loads the folder (RLS-scoped; a non-member sees null → 404, no existence
 * leak), asserts account membership (defense-in-depth, roles not consulted),
 * then applies rename then move. Hierarchy + duplicate-name guards live in the
 * service. No delete/restore here (WF-3).
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const parsed = await parseJsonBody(request, UpdateFolderRequestSchema);
  if (!parsed.ok) return parsed.response;

  const { id } = await params;
  const folder = await foldersRepo.getById(id);
  if (!folder || folder.deletedAt != null) return folderNotFoundResponse();

  const authorized = await authorizeFolderAccess(auth.userId, folder.accountId);
  if (!authorized.ok) return authorized.response;

  let current = folder;
  if (parsed.data.name !== undefined) {
    const renamed = await renameFolder({ folderId: id, name: parsed.data.name });
    if (!renamed.ok) return folderErrorResponse(renamed);
    current = renamed.data;
  }
  if (parsed.data.parentFolderId !== undefined) {
    const moved = await moveFolder({ folderId: id, newParentFolderId: parsed.data.parentFolderId });
    if (!moved.ok) return folderErrorResponse(moved);
    current = moved.data;
  }
  return NextResponse.json(toWorkflowFolder(current));
}
