import { NextResponse } from "next/server";
import { requireCronAuth } from "@/services/cron/auth";
import { cleanupExpiredFiles } from "@/services/files/cleanupExpiredFiles";

/**
 * Cron entrypoint for the workflow-files nightly reconciler.
 *
 * Vercel cron sends GET; manual / curl invocations use POST. Both
 * delegate to the same handler. Mirrors
 * `/api/cron/{poll-triggers,renew-watch-subscriptions}/route.ts`.
 *
 * Cleanup runs the bulk reconciler at `services/files/cleanupExpiredFiles`,
 * which deletes storage objects then metadata rows for every expired
 * workflow_files row (default limit 500 per tick; rows that fail
 * resurface on the next tick).
 *
 * Production schedule wiring (daily) is an ops follow-up — V2 doesn't
 * have a vercel.json cron block yet.
 *
 * To exercise locally:
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
 *        http://localhost:3000/api/cron/cleanup-workflow-files
 *
 * Response shape — counts only. No row ids, storage paths, or user ids
 * (those leak workflow / user metadata into the cron monitor):
 *   { ok: true, scanned, storageDeleted, metadataDeleted, failed, startedAt }
 */

async function handle(request: Request): Promise<Response> {
  const auth = requireCronAuth(request);
  if (!auth.authorized) {
    return NextResponse.json(
      { error: auth.message },
      { status: auth.status },
    );
  }

  try {
    const result = await cleanupExpiredFiles();
    // V2-READY-39 — structured per-tick summary so the aggregate counts (incl.
    // `failed`, the per-row storage/metadata delete failures the service
    // swallows-and-continues) reach the logs. Counts-only — no row ids, storage
    // paths, or user ids (per docs/rules/file-output-contract.md).
    console.info(
      JSON.stringify({ event: "cron.cleanup_workflow_files.done", ...result }),
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "cron.cleanup_workflow_files.fatal",
        message: (err as Error).message,
      }),
    );
    return NextResponse.json(
      { error: "Cleanup cron failed." },
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
