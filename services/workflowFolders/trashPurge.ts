import * as foldersRepo from "@/repositories/workflowFolders";
import type { PurgeableFolder } from "@/repositories/workflowFolders";
import * as workflowsTrashRepo from "@/repositories/workflowsTrash";

/**
 * Trash purge service (Slice 4.WORKFLOW-FOLDERS-5 / WF-4).
 *
 * Hard-deletes workflows + folders whose 7-day restore window has elapsed
 * (deleted_at IS NOT NULL AND purge_after <= now). Service-role only; modeled on
 * services/accounts/accountPurge.ts. The flag gate lives at the cron route — the
 * SERVICE works when called directly (tests / admin).
 *
 * Correctness invariants:
 *   - Only purges rows past purge_after. Items still in the restore window are
 *     untouched (the SQL predicate is the sole selector).
 *   - Workflows are deleted FIRST. A trashed workflow keeps its folder_id, which
 *     is ON DELETE RESTRICT → deleting its folder before the workflow would fail.
 *   - Folders are deleted children-before-parents (parent_folder_id is ON DELETE
 *     RESTRICT). Within a purgeable set we delete leaves first, iteratively.
 *   - Hard-deleting a workflow CASCADE-removes runtime children and SET-NULLs the
 *     billing ledgers (task_usage_events / ai_cost_events) — history survives, no
 *     anonymization needed.
 *   - Idempotent: every delete is delete-where-present; a re-run finds nothing.
 *
 * Counts-only result — no definitions / names / folder details leave the DB.
 */

export interface TrashPurgeResult {
  scanned: number;
  workflowsPurged: number;
  foldersPurged: number;
}

function log(event: string, extra: Record<string, unknown> = {}): void {
  console.info(JSON.stringify({ event, ...extra }));
}

export async function purgeDueTrashedItems(now?: Date): Promise<TrashPurgeResult> {
  const at = (now ?? new Date()).toISOString();

  // 1. Workflows first — clears the folder_id RESTRICT references so folders
  //    can then be deleted. CASCADE handles runtime children; ledgers SET NULL.
  const workflowIds = await workflowsTrashRepo.listPurgeableWorkflowIdsServiceRole(at);
  if (workflowIds.length > 0) {
    await workflowsTrashRepo.hardDeleteWorkflowsServiceRole(workflowIds);
  }

  // 2. Folders deepest-first (children before parents for parent_folder_id RESTRICT).
  const folders = await foldersRepo.listPurgeableFoldersServiceRole(at);
  let foldersPurged = 0;
  for (const f of orderFoldersForPurge(folders)) {
    await foldersRepo.hardDeleteFolderServiceRole(f.id);
    foldersPurged += 1;
  }

  const result: TrashPurgeResult = {
    scanned: workflowIds.length + folders.length,
    workflowsPurged: workflowIds.length,
    foldersPurged,
  };
  log("workflow_trash.purge.done", {
    scanned: result.scanned,
    workflowsPurged: result.workflowsPurged,
    foldersPurged: result.foldersPurged,
  });
  return result;
}

/**
 * Order purgeable folders leaves-first: a folder is safe to delete once no other
 * purgeable folder still references it as parent. Iterative peel of leaves
 * (bounded by depth 3). Any residual (shouldn't happen) is appended so the sweep
 * always terminates.
 */
export function orderFoldersForPurge(
  folders: readonly PurgeableFolder[],
): readonly PurgeableFolder[] {
  const remaining = new Map(folders.map((f) => [f.id, f]));
  const out: PurgeableFolder[] = [];
  while (remaining.size > 0) {
    const referencedParents = new Set<string>();
    for (const f of remaining.values()) {
      if (f.parentFolderId != null && remaining.has(f.parentFolderId)) {
        referencedParents.add(f.parentFolderId);
      }
    }
    let progressed = false;
    for (const f of [...remaining.values()]) {
      if (!referencedParents.has(f.id)) {
        out.push(f);
        remaining.delete(f.id);
        progressed = true;
      }
    }
    if (!progressed) {
      // Defensive: corrupt cycle — append the rest so we never loop forever.
      out.push(...remaining.values());
      break;
    }
  }
  return out;
}
