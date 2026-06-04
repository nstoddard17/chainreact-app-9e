import { NextResponse } from "next/server";
import { requireCronAuth } from "@/services/cron/auth";
import { isWorkflowTrashPurgeCronEnabled } from "@/services/workflowFolders/trashFlags";
import { purgeDueTrashedItems } from "@/services/workflowFolders/trashPurge";

/**
 * Cron entrypoint for the workflow-trash purge sweep (4.WORKFLOW-FOLDERS-5 / WF-4).
 *
 * Hard-deletes workflows + folders whose 7-day restore window has elapsed
 * (deleted_at IS NOT NULL AND purge_after <= now). Workflows go first (their
 * folder_id is ON DELETE RESTRICT); folders follow children-before-parents.
 * Runtime children cascade; billing ledgers (task_usage_events / ai_cost_events)
 * survive with workflow_id nulled — no anonymization step.
 *
 * DESTRUCTIVE + flag-gated. `ENABLE_WORKFLOW_TRASH_PURGE_CRON` defaults OFF —
 * when unset the route authenticates but performs NO deletion (returns
 * { ok, enabled:false }). The purge SERVICE works regardless when called
 * directly (admin / tests); only the scheduled fan-out is gated. Mirrors
 * app/api/cron/purge-pending-deletions. service_role only; cron-auth protected.
 *
 * Vercel cron sends GET with `Authorization: Bearer $CRON_SECRET`; manual /
 * curl invocations use POST. Response is counts only — no workflow definitions
 * or folder details.
 */

async function handle(request: Request): Promise<Response> {
  const auth = requireCronAuth(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  if (!isWorkflowTrashPurgeCronEnabled()) {
    console.info(JSON.stringify({ event: "cron.purge_trashed_workflows.disabled" }));
    return NextResponse.json({ ok: true, enabled: false });
  }

  try {
    const result = await purgeDueTrashedItems();
    console.info(
      JSON.stringify({ event: "cron.purge_trashed_workflows.done", ...result }),
    );
    return NextResponse.json({ ok: true, enabled: true, ...result });
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "cron.purge_trashed_workflows.fatal",
        message: (err as Error).message,
      }),
    );
    return NextResponse.json(
      { error: "Workflow-trash purge sweep cron failed." },
      { status: 500 },
    );
  }
}

export async function GET(request: Request): Promise<Response> {
  return handle(request);
}

export async function POST(request: Request): Promise<Response> {
  return handle(request);
}
