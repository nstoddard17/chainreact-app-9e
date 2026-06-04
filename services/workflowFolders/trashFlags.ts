/**
 * Workflow-trash purge rollout flag (Slice 4.WORKFLOW-FOLDERS-5 / WF-4).
 *
 * Read at call time (not module load) so tests + rollout can toggle without
 * re-importing — mirrors services/accounts/accountDeletionFlags.ts.
 */

/** Env var gating the destructive trash-purge cron. */
export const WORKFLOW_TRASH_PURGE_CRON_FLAG = "ENABLE_WORKFLOW_TRASH_PURGE_CRON";

/**
 * DEFAULT OFF. When false, the purge cron route authenticates but performs NO
 * deletion — it returns a skipped summary. The purge SERVICE
 * (purgeDueTrashedItems) works regardless when called directly (tests / admin);
 * only the scheduled fan-out is gated by this flag.
 */
export function isWorkflowTrashPurgeCronEnabled(): boolean {
  return process.env[WORKFLOW_TRASH_PURGE_CRON_FLAG] === "true";
}
