import * as foldersRepo from "@/repositories/workflowFolders";
import type { WorkflowFolderRecord } from "@/repositories/workflowFolders";
import * as workflowsRepo from "@/repositories/workflows";
import { MAX_FOLDER_DEPTH } from "./folderLimits";
import {
  depthForChildOf,
  moveCreatesCycle,
  resultingDepthAfterMove,
  type FolderNode,
} from "./hierarchy";

/**
 * Folder CRUD + hierarchy orchestration (Slice 4.WORKFLOW-FOLDERS-3 / WF-2).
 *
 * Membership-based authorization (roles do NOT gate folders — locked decision):
 * the route resolves the caller's account (requireUserWithAccount) or loads a
 * folder/workflow whose account membership is RLS-gated, then calls these. RLS
 * scopes every repo read/write to account members, so a non-member cannot see or
 * mutate a folder. These helpers add the hierarchy + limit + same-account guards
 * on top and return typed outcomes (never throw for an expected rejection).
 *
 * Scope: create / rename / move / reorder folders + move a workflow into / out
 * of a folder. NO delete-modes, trash, restore, or purge (WF-3 / WF-4).
 */

export type FolderErrorCode =
  | "FOLDER_NOT_FOUND"
  | "FOLDER_NAME_TAKEN"
  | "FOLDER_TOO_DEEP"
  | "FOLDER_CYCLE"
  | "FOLDER_LIMIT_REACHED"
  | "FOLDER_CROSS_ACCOUNT"
  | "FOLDER_TRASHED";

export type FolderResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: FolderErrorCode; message: string };

function fail(code: FolderErrorCode, message: string): { ok: false; code: FolderErrorCode; message: string } {
  return { ok: false, code, message };
}

function normalizeName(name: string): string {
  return name.trim();
}

function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function toNodeMap(folders: readonly WorkflowFolderRecord[]): Map<string, FolderNode> {
  return new Map(folders.map((f) => [f.id, { id: f.id, parentFolderId: f.parentFolderId }]));
}

/**
 * Map a backstop DB error (unique sibling-name index / same-account trigger) to a
 * typed outcome. The service pre-checks these in memory, so these only fire on a
 * race; rethrows anything unrecognized.
 */
function mapDbError(err: unknown): { ok: false; code: FolderErrorCode; message: string } {
  const msg = err instanceof Error ? err.message : String(err);
  if (/same_account_violation/i.test(msg)) {
    return fail("FOLDER_CROSS_ACCOUNT", "Folder and parent must belong to the same account.");
  }
  if (/duplicate key|unique constraint|workflow_folders_unique_sibling_name_live|23505/i.test(msg)) {
    return fail("FOLDER_NAME_TAKEN", "A folder with that name already exists here.");
  }
  throw err instanceof Error ? err : new Error(msg);
}

// ── list ─────────────────────────────────────────────────────────────────────

export async function listFolders(
  accountId: string,
): Promise<readonly WorkflowFolderRecord[]> {
  return foldersRepo.listByAccount(accountId);
}

// ── create ───────────────────────────────────────────────────────────────────

export interface CreateFolderServiceInput {
  accountId: string;
  /** Plan-resolved live-folder cap (PRICING-LOCK); `null` = uncapped (enterprise). */
  folderLimit: number | null;
  userId: string;
  name: string;
  parentFolderId?: string | null;
}

export async function createFolder(
  input: CreateFolderServiceInput,
): Promise<FolderResult<WorkflowFolderRecord>> {
  const name = normalizeName(input.name);
  const parentId = input.parentFolderId ?? null;
  const live = await foldersRepo.listByAccount(input.accountId);
  const byId = toNodeMap(live);

  // Parent must be a live folder in this account (RLS already hides other
  // accounts' / trashed folders, so an unknown id is genuinely not available).
  if (parentId != null && !byId.has(parentId)) {
    return fail("FOLDER_NOT_FOUND", "Parent folder not found.");
  }

  // Depth ceiling.
  if (depthForChildOf(parentId, byId) > MAX_FOLDER_DEPTH) {
    return fail("FOLDER_TOO_DEEP", `Folders can be nested at most ${MAX_FOLDER_DEPTH} levels deep.`);
  }

  // Plan limit (live folders only; trashed don't count, the list is live-only). A null cap
  // means uncapped (enterprise), so no check.
  if (input.folderLimit !== null && live.length >= input.folderLimit) {
    return fail("FOLDER_LIMIT_REACHED", "You've reached the folder limit for this plan.");
  }

  // Duplicate live sibling name within the same parent.
  if (live.some((f) => f.parentFolderId === parentId && sameName(f.name, name))) {
    return fail("FOLDER_NAME_TAKEN", "A folder with that name already exists here.");
  }

  const position = nextPositionAmong(live, parentId);
  try {
    const created = await foldersRepo.create({
      accountId: input.accountId,
      createdByUserId: input.userId,
      name,
      parentFolderId: parentId,
      position,
    });
    return { ok: true, data: created };
  } catch (err) {
    return mapDbError(err);
  }
}

// ── rename ───────────────────────────────────────────────────────────────────

export interface RenameFolderServiceInput {
  folderId: string;
  name: string;
}

export async function renameFolder(
  input: RenameFolderServiceInput,
): Promise<FolderResult<WorkflowFolderRecord>> {
  const name = normalizeName(input.name);
  const folder = await foldersRepo.getById(input.folderId);
  if (!folder || folder.deletedAt != null) {
    return fail("FOLDER_NOT_FOUND", "Folder not found.");
  }
  // Duplicate among live siblings (same parent), excluding the folder itself.
  const live = await foldersRepo.listByAccount(folder.accountId);
  if (
    live.some(
      (f) => f.id !== folder.id && f.parentFolderId === folder.parentFolderId && sameName(f.name, name),
    )
  ) {
    return fail("FOLDER_NAME_TAKEN", "A folder with that name already exists here.");
  }
  try {
    const updated = await foldersRepo.updateName(input.folderId, name);
    return { ok: true, data: updated };
  } catch (err) {
    return mapDbError(err);
  }
}

// ── move ─────────────────────────────────────────────────────────────────────

export interface MoveFolderServiceInput {
  folderId: string;
  newParentFolderId: string | null;
}

export async function moveFolder(
  input: MoveFolderServiceInput,
): Promise<FolderResult<WorkflowFolderRecord>> {
  const folder = await foldersRepo.getById(input.folderId);
  if (!folder || folder.deletedAt != null) {
    return fail("FOLDER_NOT_FOUND", "Folder not found.");
  }
  const newParentId = input.newParentFolderId;
  const live = await foldersRepo.listByAccount(folder.accountId);
  const byId = toNodeMap(live);

  if (newParentId != null && !byId.has(newParentId)) {
    // Other-account / trashed / unknown parent — all invisible via RLS / live filter.
    return fail("FOLDER_NOT_FOUND", "Destination folder not found.");
  }
  if (moveCreatesCycle(folder.id, newParentId, byId)) {
    return fail("FOLDER_CYCLE", "A folder cannot be moved into itself or one of its subfolders.");
  }
  if (resultingDepthAfterMove(folder.id, newParentId, byId) > MAX_FOLDER_DEPTH) {
    return fail("FOLDER_TOO_DEEP", `That move would nest folders deeper than ${MAX_FOLDER_DEPTH} levels.`);
  }
  // Duplicate name in the destination sibling group (excluding self).
  if (
    live.some(
      (f) => f.id !== folder.id && f.parentFolderId === newParentId && sameName(f.name, folder.name),
    )
  ) {
    return fail("FOLDER_NAME_TAKEN", "A folder with that name already exists in the destination.");
  }
  const position = nextPositionAmong(live, newParentId);
  try {
    const moved = await foldersRepo.updateParentAndPosition(folder.id, newParentId, position);
    return { ok: true, data: moved };
  } catch (err) {
    return mapDbError(err);
  }
}

// ── reorder ──────────────────────────────────────────────────────────────────

export interface ReorderFoldersServiceInput {
  accountId: string;
  parentFolderId: string | null;
  /** The desired full order of the sibling group, by id. Last-write-wins. */
  orderedIds: readonly string[];
}

export async function reorderFolders(
  input: ReorderFoldersServiceInput,
): Promise<FolderResult<{ count: number }>> {
  const live = await foldersRepo.listByAccount(input.accountId);
  const siblings = new Set(
    live.filter((f) => f.parentFolderId === input.parentFolderId).map((f) => f.id),
  );
  // Every id must be a live sibling of this parent in this account — no
  // cross-parent / cross-account smuggling.
  for (const id of input.orderedIds) {
    if (!siblings.has(id)) {
      return fail("FOLDER_NOT_FOUND", "One or more folders are not in this group.");
    }
  }
  const updates = input.orderedIds.map((id, index) => ({ id, position: index }));
  await foldersRepo.updatePositions(updates);
  return { ok: true, data: { count: updates.length } };
}

// ── workflow movement ─────────────────────────────────────────────────────────

export interface MoveWorkflowServiceInput {
  /** The workflow's own account (resolved by the route from the loaded workflow). */
  accountId: string;
  workflowId: string;
  /** Target folder, or null to uncategorize. */
  folderId: string | null;
}

export async function moveWorkflowToFolder(
  input: MoveWorkflowServiceInput,
): Promise<FolderResult<null>> {
  if (input.folderId != null) {
    const folder = await foldersRepo.getById(input.folderId);
    // Not visible (other account) → not found; trashed → not allowed.
    if (!folder) return fail("FOLDER_NOT_FOUND", "Folder not found.");
    if (folder.deletedAt != null) return fail("FOLDER_TRASHED", "Cannot move into a trashed folder.");
    if (folder.accountId !== input.accountId) {
      return fail("FOLDER_CROSS_ACCOUNT", "The folder belongs to a different account.");
    }
  }
  try {
    await workflowsRepo.updateFolder(input.workflowId, input.folderId);
    return { ok: true, data: null };
  } catch (err) {
    return mapDbError(err);
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

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
