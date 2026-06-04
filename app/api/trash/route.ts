import { NextResponse } from "next/server";
import { listTrash } from "@/services/workflowFolders/trashService";
import { requireUserWithAccount } from "@/app/api/folders/_shared";

/**
 * GET /api/trash — list the active account's trashed workflows + folders that
 * are still within the 7-day restore window (deleted_at set, purge_after in the
 * future). Account-membership scoped via requireUserWithAccount + RLS; a
 * non-member never sees another account's trash. Roles do not gate trash.
 *
 * Read-only listing — restore happens via the per-item restore endpoints. Only
 * id/name/timestamps/batch id leave the server (no definitions or config).
 */
export async function GET() {
  const auth = await requireUserWithAccount();
  if (!auth.ok) return auth.response;

  const { folders, workflows } = await listTrash(auth.accountId);

  return NextResponse.json({
    folders: folders.map((f) => ({
      id: f.id,
      name: f.name,
      deletedAt: f.deletedAt,
      purgeAfter: f.purgeAfter,
      deletedFromParentFolderId: f.deletedFromParentFolderId,
      deleteOperationId: f.deleteOperationId,
    })),
    workflows: workflows.map((w) => ({
      id: w.id,
      name: w.name,
      deletedAt: w.deletedAt,
      purgeAfter: w.purgeAfter,
      deletedFromFolderId: w.deletedFromFolderId,
      deleteOperationId: w.deleteOperationId,
    })),
  });
}
