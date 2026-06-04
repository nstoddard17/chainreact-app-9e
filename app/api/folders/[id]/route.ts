import { NextResponse } from "next/server";
import * as foldersRepo from "@/repositories/workflowFolders";
import { UpdateFolderRequestSchema } from "@/contracts/folders";
import { moveFolder, renameFolder } from "@/services/workflowFolders/folderService";
import { deleteFolder, type FolderDeleteMode } from "@/services/workflowFolders/trashService";
import {
  authorizeFolderAccess,
  folderErrorResponse,
  folderNotFoundResponse,
  parseJsonBody,
  requireUser,
  toWorkflowFolder,
  trashErrorResponse,
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

/**
 * DELETE /api/folders/[id]?mode=folder_only|with_contents — soft-delete to Trash (WF-3).
 *
 *   - folder_only (default): delete only this folder; promote its direct child
 *     folders + contained workflows one level.
 *   - with_contents: trash the whole subtree + every contained workflow under one
 *     delete_operation_id, so they restore together.
 *
 * Returns the delete_operation_id for a future Undo (WF-5).
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const folder = await foldersRepo.getById(id);
  if (!folder || folder.deletedAt != null) return folderNotFoundResponse();

  const authorized = await authorizeFolderAccess(auth.userId, folder.accountId);
  if (!authorized.ok) return authorized.response;

  const modeParam = new URL(request.url).searchParams.get("mode");
  const mode: FolderDeleteMode = modeParam === "with_contents" ? "with_contents" : "folder_only";

  const result = await deleteFolder({ folderId: id, userId: auth.userId, mode });
  if (!result.ok) return trashErrorResponse(result);
  return NextResponse.json({ ok: true, deleteOperationId: result.data.deleteOperationId, mode });
}
