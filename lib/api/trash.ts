import { FolderApiError } from "./folders";

/**
 * Typed client for Trash + workflow soft-delete/restore + move-to-folder
 * (Slice 4.WORKFLOW-FOLDERS-6 / WF-5). Wraps the WF-3 routes:
 *   GET  /api/trash
 *   DELETE /api/workflows/[id]                  (soft-delete → Trash)
 *   POST   /api/workflows/[id]/restore
 *   PATCH  /api/workflows/[id]  { folderId }    (move into folder / uncategorize)
 *
 * Reuses FolderApiError for a single error type across the folder/trash surface.
 */

export interface TrashedWorkflow {
  id: string;
  name: string;
  deletedAt: string | null;
  purgeAfter: string | null;
  deletedFromFolderId: string | null;
  deleteOperationId: string | null;
}

export interface TrashedFolder {
  id: string;
  name: string;
  deletedAt: string | null;
  purgeAfter: string | null;
  deletedFromParentFolderId: string | null;
  deleteOperationId: string | null;
}

export interface TrashListing {
  folders: TrashedFolder[];
  workflows: TrashedWorkflow[];
}

async function fail(res: Response): Promise<FolderApiError> {
  let body: { error?: string; code?: string } = {};
  try {
    body = (await res.json()) as { error?: string; code?: string };
  } catch {
    /* not json */
  }
  const message = body.error ?? `Trash request failed (HTTP ${res.status}).`;
  const code =
    res.status === 404
      ? "FOLDER_NOT_FOUND"
      : res.status === 401
        ? "UNAUTHENTICATED"
        : res.status >= 500
          ? "SERVER_ERROR"
          : "UNKNOWN";
  return new FolderApiError(message, code, res.status);
}

export async function listTrash(): Promise<TrashListing> {
  const res = await fetch("/api/trash");
  if (!res.ok) throw await fail(res);
  return (await res.json()) as TrashListing;
}

export interface DeleteWorkflowResult {
  ok: true;
  deleteOperationId: string;
  purgeAfter: string;
}

export async function deleteWorkflow(id: string): Promise<DeleteWorkflowResult> {
  const res = await fetch(`/api/workflows/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw await fail(res);
  return (await res.json()) as DeleteWorkflowResult;
}

export async function restoreWorkflow(id: string): Promise<void> {
  const res = await fetch(`/api/workflows/${encodeURIComponent(id)}/restore`, {
    method: "POST",
  });
  if (!res.ok) throw await fail(res);
}

/** Move a workflow into a folder, or pass `null` to uncategorize. */
export async function moveWorkflowToFolder(
  id: string,
  folderId: string | null,
): Promise<void> {
  const res = await fetch(`/api/workflows/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ folderId }),
  });
  if (!res.ok) throw await fail(res);
}
