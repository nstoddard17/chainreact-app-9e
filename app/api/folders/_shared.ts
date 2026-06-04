import { NextResponse } from "next/server";
import { isMember } from "@/repositories/accountMemberships";
import type { WorkflowFolderRecord } from "@/repositories/workflowFolders";
import type { FolderErrorCode, FolderResult } from "@/services/workflowFolders/folderService";
import type { WorkflowFolder } from "@/contracts/folders";

/**
 * Shared route-layer helpers for /api/folders (Slice 4.WORKFLOW-FOLDERS-3 / WF-2).
 *
 * Underscore-prefixed: not a route. Re-exports the cross-cutting auth gates from
 * the workflows route group (single source of truth for requireUser /
 * requireUserWithAccount / parseJsonBody — no duplication of the freeze /
 * not-member 403 mapping) and adds folder-specific serialization + error mapping.
 */

export {
  requireUser,
  requireUserWithAccount,
  parseJsonBody,
} from "@/app/api/workflows/_shared";

export function toWorkflowFolder(record: WorkflowFolderRecord): WorkflowFolder {
  return {
    id: record.id,
    accountId: record.accountId,
    parentFolderId: record.parentFolderId,
    name: record.name,
    position: record.position,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

/** Standard "folder not found" (also the no-leak shape a non-member sees). */
export function folderNotFoundResponse(): NextResponse {
  return NextResponse.json(
    { error: "Folder not found.", code: "FOLDER_NOT_FOUND" },
    { status: 404 },
  );
}

const FOLDER_HTTP_STATUS: Readonly<Record<FolderErrorCode, number>> = {
  FOLDER_NOT_FOUND: 404,
  FOLDER_NAME_TAKEN: 409,
  FOLDER_TOO_DEEP: 422,
  FOLDER_CYCLE: 422,
  FOLDER_LIMIT_REACHED: 403,
  FOLDER_CROSS_ACCOUNT: 400,
  FOLDER_TRASHED: 409,
};

/** Map a failed FolderResult to a code-stable JSON response. */
export function folderErrorResponse(
  result: Extract<FolderResult<unknown>, { ok: false }>,
): NextResponse {
  return NextResponse.json(
    { error: result.message, code: result.code },
    { status: FOLDER_HTTP_STATUS[result.code] },
  );
}

/**
 * Membership-based authorization for a folder's account (defense-in-depth over
 * RLS — roles are NOT consulted). A non-member collapses to the standard 404,
 * no existence leak. Mirrors requireWorkflowAccountMember.
 */
export async function authorizeFolderAccess(
  userId: string,
  accountId: string,
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const member = await isMember(userId, accountId);
  if (!member) return { ok: false, response: folderNotFoundResponse() };
  return { ok: true };
}
