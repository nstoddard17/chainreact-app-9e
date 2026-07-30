import * as foldersRepo from "@/repositories/workflowFolders";
import type { PurgeableFolder } from "@/repositories/workflowFolders";
import * as workflowsTrashRepo from "@/repositories/workflowsTrash";
import { deleteOrphanedThreadsServiceRole } from "@/repositories/builderAgentThreads";

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
 *   - Hard-deleting a workflow CASCADE-removes runtime children — including its
 *     React Agent conversation (builder_agent_threads → builder_agent_messages) —
 *     and SET-NULLs the billing ledgers (task_usage_events / ai_cost_events), so
 *     history survives with no anonymization step.
 *   - A workflow still INSIDE its restore window keeps its conversation. Nothing
 *     here expires a conversation by age; retention follows the workflow row.
 *   - Idempotent: every delete is delete-where-present; a re-run finds nothing.
 *
 * Counts-only result — no definitions / names / folder details leave the DB.
 */

export interface TrashPurgeResult {
  scanned: number;
  workflowsPurged: number;
  foldersPurged: number;
  /**
   * REACT-AGENT-CONVERSATION-RETENTION-1 — React Agent conversation threads found
   * referencing a workflow that no longer exists. Expected to be 0 forever: the
   * FK is NOT NULL + CASCADE + VALIDATED, so the database removes a workflow's
   * threads itself. A non-zero value here means the constraint was weakened and
   * is worth investigating, not celebrating.
   */
  orphanThreadsPurged: number;
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

  // 3. REACT-AGENT-CONVERSATION-RETENTION-1 — drift backstop. The workflow
  //    deletes above already cascaded their conversations away; this only finds
  //    threads whose workflow row is MISSING, which the FK makes impossible on a
  //    healthy database. Fail-open: a purge that deleted workflows must not be
  //    reported as failed because a defensive sweep hiccupped.
  let orphanThreadsPurged = 0;
  try {
    orphanThreadsPurged = (await deleteOrphanedThreadsServiceRole()).threadsDeleted;
    if (orphanThreadsPurged > 0) {
      log("workflow_trash.purge.orphan_agent_threads", { orphanThreadsPurged });
    }
  } catch (err) {
    log("workflow_trash.purge.orphan_sweep_failed", {
      message: (err as Error).message,
    });
  }

  const result: TrashPurgeResult = {
    scanned: workflowIds.length + folders.length,
    workflowsPurged: workflowIds.length,
    foldersPurged,
    orphanThreadsPurged,
  };
  log("workflow_trash.purge.done", {
    scanned: result.scanned,
    workflowsPurged: result.workflowsPurged,
    foldersPurged: result.foldersPurged,
    orphanThreadsPurged: result.orphanThreadsPurged,
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
