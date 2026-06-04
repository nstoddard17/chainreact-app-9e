import { randomUUID } from "node:crypto";
import * as foldersRepo from "@/repositories/workflowFolders";
import type { WorkflowFolderRecord } from "@/repositories/workflowFolders";
import * as workflowsRepo from "@/repositories/workflows";
import * as workflowsTrashRepo from "@/repositories/workflowsTrash";
import type { WorkflowRecord } from "@/repositories/workflows";
import { createLifecycleOrchestrator } from "@/services/workflows/orchestratorFactory";
import { LifecycleError } from "@/core/workflows/lifecycle";
import { descendantIds, type FolderNode } from "./hierarchy";

/**
 * Trash soft-delete + restore orchestration (Slice 4.WORKFLOW-FOLDERS-4 / WF-3).
 *
 * Spans workflows + folders. Workflows go through the LifecycleOrchestrator so
 * trigger teardown (delete) happens and restore lands in `draft` WITHOUT
 * re-registering triggers. Folders are soft-deleted/restored directly via the
 * folders repo. A single `delete_operation_id` ties a folder-with-contents
 * delete into one batch so restore reconstructs the subtree together.
 *
 * NO hard delete here — the 7-day purge is WF-4's cron. NO UI — WF-5.
 * Authorization is membership-based and enforced at the route (RLS scopes every
 * repo read/write to account members); roles are never consulted.
 */

export const WORKFLOW_TRASH_RETENTION_DAYS = 7;

export type TrashErrorCode =
  | "WORKFLOW_NOT_FOUND"
  | "FOLDER_NOT_FOUND"
  | "NOT_TRASHED"
  | "LIFECYCLE_CONFLICT"
  | "INVALID_TRANSITION"
  | "FOLDER_NAME_TAKEN";

export type TrashResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: TrashErrorCode; message: string; status: number };

function fail(code: TrashErrorCode, message: string, status: number): {
  ok: false;
  code: TrashErrorCode;
  message: string;
  status: number;
} {
  return { ok: false, code, message, status };
}

function trashTimestamps(): { deletedAt: string; purgeAfter: string } {
  const now = new Date();
  const purge = new Date(now.getTime() + WORKFLOW_TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  return { deletedAt: now.toISOString(), purgeAfter: purge.toISOString() };
}

function mapLifecycleError(err: unknown): { ok: false; code: TrashErrorCode; message: string; status: number } {
  if (err instanceof LifecycleError) {
    const status = err.code === "WORKFLOW_NOT_FOUND" ? 404 : 409;
    return fail(err.code as TrashErrorCode, err.message, status);
  }
  throw err instanceof Error ? err : new Error(String(err));
}

function toNodeMap(folders: readonly WorkflowFolderRecord[]): Map<string, FolderNode> {
  return new Map(folders.map((f) => [f.id, { id: f.id, parentFolderId: f.parentFolderId }]));
}

// ── workflow delete / restore ──────────────────────────────────────────────────

export interface DeleteWorkflowResult {
  deleteOperationId: string;
  deletedAt: string;
  purgeAfter: string;
}

export async function deleteWorkflow(
  workflowId: string,
  userId: string,
): Promise<TrashResult<DeleteWorkflowResult>> {
  const wf = await workflowsRepo.getById(workflowId);
  if (!wf || wf.state === "deleted") {
    return fail("WORKFLOW_NOT_FOUND", "Workflow not found.", 404);
  }
  const deleteOperationId = randomUUID();
  const { deletedAt, purgeAfter } = trashTimestamps();
  try {
    await createLifecycleOrchestrator().delete(workflowId, {
      deletedAt,
      deletedByUserId: userId,
      purgeAfter,
      deletedFromFolderId: wf.folderId,
      deleteOperationId,
    });
  } catch (err) {
    return mapLifecycleError(err);
  }
  return { ok: true, data: { deleteOperationId, deletedAt, purgeAfter } };
}

/** Resolve the folder a workflow restores into: original if still live, else root. */
async function resolveRestoreFolder(folderId: string | null): Promise<string | null> {
  if (folderId == null) return null;
  const folder = await foldersRepo.getById(folderId);
  return folder && folder.deletedAt == null ? folderId : null;
}

export async function restoreWorkflow(workflowId: string): Promise<TrashResult<null>> {
  const wf = await workflowsRepo.getById(workflowId);
  if (!wf) return fail("WORKFLOW_NOT_FOUND", "Workflow not found.", 404);
  if (wf.state !== "deleted") {
    return fail("NOT_TRASHED", "Workflow is not in the trash.", 409);
  }
  const folderId = await resolveRestoreFolder(wf.deletedFromFolderId);
  try {
    await createLifecycleOrchestrator().restore(workflowId, { folderId });
  } catch (err) {
    return mapLifecycleError(err);
  }
  return { ok: true, data: null };
}

// ── folder delete (both modes) ─────────────────────────────────────────────────

export type FolderDeleteMode = "folder_only" | "with_contents";

export interface DeleteFolderResult {
  deleteOperationId: string;
  mode: FolderDeleteMode;
}

export async function deleteFolder(input: {
  folderId: string;
  userId: string;
  mode: FolderDeleteMode;
}): Promise<TrashResult<DeleteFolderResult>> {
  const folder = await foldersRepo.getById(input.folderId);
  if (!folder || folder.deletedAt != null) {
    return fail("FOLDER_NOT_FOUND", "Folder not found.", 404);
  }
  const deleteOperationId = randomUUID();
  const ts = trashTimestamps();
  const live = await foldersRepo.listByAccount(folder.accountId);
  const byId = toNodeMap(live);

  if (input.mode === "folder_only") {
    // Promote direct child folders + contained workflows one level (to the
    // deleted folder's own parent), then soft-delete just this folder.
    try {
      let pos = nextPositionAmong(live, folder.parentFolderId);
      for (const child of live.filter((f) => f.parentFolderId === input.folderId)) {
        await foldersRepo.updateParentAndPosition(child.id, folder.parentFolderId, pos++);
      }
      await workflowsTrashRepo.reparentWorkflows(input.folderId, folder.parentFolderId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/duplicate key|unique constraint|sibling_name/i.test(msg)) {
        return fail("FOLDER_NAME_TAKEN", "A promoted folder collides with an existing name.", 409);
      }
      throw err instanceof Error ? err : new Error(msg);
    }
    await foldersRepo.softDelete({
      folderId: input.folderId,
      deletedAt: ts.deletedAt,
      deletedByUserId: input.userId,
      purgeAfter: ts.purgeAfter,
      deletedFromParentFolderId: folder.parentFolderId,
      deleteOperationId,
    });
    return { ok: true, data: { deleteOperationId, mode: input.mode } };
  }

  // with_contents — soft-delete the whole subtree + every contained workflow
  // under one batch id.
  const subtreeIds = [input.folderId, ...descendantIds(input.folderId, byId)];
  const contained = await workflowsTrashRepo.listByFolderIds(subtreeIds);
  const orch = createLifecycleOrchestrator();
  for (const w of contained) {
    try {
      await orch.delete(w.id, {
        deletedAt: ts.deletedAt,
        deletedByUserId: input.userId,
        purgeAfter: ts.purgeAfter,
        deletedFromFolderId: w.folderId,
        deleteOperationId,
      });
    } catch (err) {
      return mapLifecycleError(err);
    }
  }
  for (const fid of subtreeIds) {
    const node = byId.get(fid);
    await foldersRepo.softDelete({
      folderId: fid,
      deletedAt: ts.deletedAt,
      deletedByUserId: input.userId,
      purgeAfter: ts.purgeAfter,
      deletedFromParentFolderId: node?.parentFolderId ?? null,
      deleteOperationId,
    });
  }
  return { ok: true, data: { deleteOperationId, mode: input.mode } };
}

// ── folder restore (batch by delete_operation_id) ──────────────────────────────

export interface RestoreFolderResult {
  deleteOperationId: string | null;
  restoredFolders: number;
  restoredWorkflows: number;
}

export async function restoreFolder(folderId: string): Promise<TrashResult<RestoreFolderResult>> {
  const folder = await foldersRepo.getById(folderId);
  if (!folder) return fail("FOLDER_NOT_FOUND", "Folder not found.", 404);
  if (folder.deletedAt == null) return fail("NOT_TRASHED", "Folder is not in the trash.", 409);

  const opId = folder.deleteOperationId;
  const batchFolders = opId
    ? (await foldersRepo.listByDeleteOperation(opId)).filter((f) => f.deletedAt != null)
    : [folder];
  const batchWorkflows = opId
    ? (await workflowsTrashRepo.listByDeleteOperation(opId)).filter((w) => w.state === "deleted")
    : [];

  const liveFolderIds = new Set(
    (await foldersRepo.listByAccount(folder.accountId)).map((f) => f.id),
  );
  const inBatch = new Set(batchFolders.map((f) => f.id));
  const restoredIds = new Set<string>();

  // Restore folders parents-before-children so a child's restored parent exists.
  for (const f of orderFoldersForRestore(batchFolders)) {
    const orig = f.deletedFromParentFolderId;
    const parent =
      orig != null && (restoredIds.has(orig) || (liveFolderIds.has(orig) && !inBatch.has(orig)))
        ? orig
        : null;
    await foldersRepo.restore(f.id, parent);
    restoredIds.add(f.id);
    liveFolderIds.add(f.id);
  }

  // Restore workflows to their original folder if it's now live, else root.
  const orch = createLifecycleOrchestrator();
  for (const w of batchWorkflows) {
    const orig = w.deletedFromFolderId;
    const target = orig != null && liveFolderIds.has(orig) ? orig : null;
    try {
      await orch.restore(w.id, { folderId: target });
    } catch (err) {
      return mapLifecycleError(err);
    }
  }

  return {
    ok: true,
    data: {
      deleteOperationId: opId,
      restoredFolders: batchFolders.length,
      restoredWorkflows: batchWorkflows.length,
    },
  };
}

// ── trash listing ──────────────────────────────────────────────────────────────

export interface TrashListing {
  folders: readonly WorkflowFolderRecord[];
  workflows: readonly WorkflowRecord[];
}

export async function listTrash(accountId: string): Promise<TrashListing> {
  const [folders, workflows] = await Promise.all([
    foldersRepo.listTrashedByAccount(accountId),
    workflowsTrashRepo.listTrashedByAccount(accountId),
  ]);
  return { folders, workflows };
}

// ── helpers ────────────────────────────────────────────────────────────────────

function nextPositionAmong(
  live: readonly WorkflowFolderRecord[],
  parentId: string | null,
): number {
  let max = -1;
  for (const f of live) {
    if (f.parentFolderId === parentId && f.position > max) max = f.position;
  }
  return max + 1;
}

/**
 * Order trashed folders so ancestors come before descendants, using the
 * snapshotted `deletedFromParentFolderId` chains WITHIN the batch. A folder
 * whose original parent is outside the batch (or null) sorts first.
 */
export function orderFoldersForRestore(
  folders: readonly WorkflowFolderRecord[],
): readonly WorkflowFolderRecord[] {
  const inBatch = new Set(folders.map((f) => f.id));
  const depthCache = new Map<string, number>();
  const byId = new Map(folders.map((f) => [f.id, f]));

  function originalDepth(f: WorkflowFolderRecord, seen: Set<string>): number {
    const cached = depthCache.get(f.id);
    if (cached !== undefined) return cached;
    const parent = f.deletedFromParentFolderId;
    let d: number;
    if (parent == null || !inBatch.has(parent) || seen.has(parent)) {
      d = 1;
    } else {
      seen.add(f.id);
      d = originalDepth(byId.get(parent)!, seen) + 1;
    }
    depthCache.set(f.id, d);
    return d;
  }

  return [...folders].sort(
    (a, b) => originalDepth(a, new Set()) - originalDepth(b, new Set()),
  );
}
