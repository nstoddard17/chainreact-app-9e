import { createClient } from "@/utils/supabase/server";
import { getServiceRoleClient } from "./supabase/serviceRoleClient";
import { rowToRecord, type WorkflowRecord, type WorkflowsRow } from "./workflows";

/**
 * Workflow trash queries (Slice 4.WORKFLOW-FOLDERS-4 / WF-3 + WF-4).
 *
 * Split out of repositories/workflows.ts (which was over the soft line cap).
 * Two audiences:
 *   - Session-client (RLS-scoped) helpers used by the user-facing trash service
 *     (folder delete-with-contents, batch restore, the Trash listing).
 *   - Service-role purge helpers (WF-4) used ONLY by the flag-gated purge cron —
 *     they bypass RLS to sweep every account's expired trash.
 *
 * Hard-deleting a workflow row CASCADE-removes its runtime children
 * (workflow_runs / workflow_revisions / trigger_resources / workflow_files /
 * builder_agent_threads) and SET-NULLs the billing ledgers (task_usage_events /
 * ai_cost_events) — so billing history survives a purge with workflow_id nulled,
 * no anonymization step needed.
 */

// ── session-client (RLS) helpers ────────────────────────────────────────────

/**
 * Live (non-deleted) workflows whose folder_id is in `folderIds`. Used by the
 * folder delete-with-contents path to collect contained workflows. RLS scopes
 * to account members.
 */
export async function listByFolderIds(
  folderIds: readonly string[],
): Promise<readonly WorkflowRecord[]> {
  if (folderIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workflows")
    .select("*")
    .in("folder_id", folderIds as string[])
    .neq("state", "deleted");
  if (error) throw new Error(`workflowsTrash.listByFolderIds failed: ${error.message}`);
  return (data ?? []).map((r) => rowToRecord(r as WorkflowsRow));
}

/**
 * Bulk reparent live workflows from one folder to another (or to uncategorized
 * when `toFolderId` is null). Folder-only delete promotes contained workflows
 * one level. The same-account trigger backstops cross-account targets.
 */
export async function reparentWorkflows(
  fromFolderId: string,
  toFolderId: string | null,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("workflows")
    .update({ folder_id: toFolderId })
    .eq("folder_id", fromFolderId)
    .neq("state", "deleted");
  if (error) throw new Error(`workflowsTrash.reparentWorkflows failed: ${error.message}`);
}

/** All workflows stamped with a trash batch id (for batch restore). */
export async function listByDeleteOperation(
  deleteOperationId: string,
): Promise<readonly WorkflowRecord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workflows")
    .select("*")
    .eq("delete_operation_id", deleteOperationId);
  if (error) throw new Error(`workflowsTrash.listByDeleteOperation failed: ${error.message}`);
  return (data ?? []).map((r) => rowToRecord(r as WorkflowsRow));
}

/**
 * Trashed workflows still within the restore window for an account
 * (deleted + purge_after in the future). The Trash listing.
 */
export async function listTrashedByAccount(
  accountId: string,
): Promise<readonly WorkflowRecord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workflows")
    .select("*")
    .eq("account_id", accountId)
    .eq("state", "deleted")
    .not("deleted_at", "is", null)
    .gt("purge_after", new Date().toISOString())
    .order("deleted_at", { ascending: false });
  if (error) throw new Error(`workflowsTrash.listTrashedByAccount failed: ${error.message}`);
  return (data ?? []).map((r) => rowToRecord(r as WorkflowsRow));
}

// ── service-role purge helpers (WF-4) ───────────────────────────────────────

/**
 * Service-role: ids of workflows whose restore window has elapsed
 * (deleted_at IS NOT NULL AND purge_after <= `nowIso`) across ALL accounts.
 * Bypasses RLS — purge-cron only. Returns ids only (counts-only contract; no
 * definitions / names leave the DB).
 */
export async function listPurgeableWorkflowIdsServiceRole(
  nowIso: string,
): Promise<readonly string[]> {
  const supabase = getServiceRoleClient("workflow trash purge: list purgeable workflows");
  const { data, error } = await supabase
    .from("workflows")
    .select("id")
    .not("deleted_at", "is", null)
    .lte("purge_after", nowIso);
  if (error) {
    throw new Error(`workflowsTrash.listPurgeableWorkflowIdsServiceRole failed: ${error.message}`);
  }
  return (data ?? []).map((r) => (r as { id: string }).id);
}

/**
 * Service-role: hard-delete workflow rows by id. Idempotent (delete-where-present).
 * Runtime children cascade; billing ledgers SET NULL (history preserved).
 */
export async function hardDeleteWorkflowsServiceRole(
  ids: readonly string[],
): Promise<void> {
  if (ids.length === 0) return;
  const supabase = getServiceRoleClient("workflow trash purge: hard-delete workflows");
  const { error } = await supabase.from("workflows").delete().in("id", ids as string[]);
  if (error) {
    throw new Error(`workflowsTrash.hardDeleteWorkflowsServiceRole failed: ${error.message}`);
  }
}
