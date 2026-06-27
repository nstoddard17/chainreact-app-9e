import { NextResponse } from "next/server";
import { requireCronAuth } from "@/services/cron/auth";
import { withCronHeartbeat } from "@/services/observability/signalRecorders";
import { processQueuedRuns } from "@/services/execution/runQueueProcessor";
import { DEFAULT_QUEUE_BATCH_LIMIT } from "./constants";

/**
 * Cron entrypoint for the durable run-queue processor (Slice 6.DURABLE-QUEUE-1).
 *
 * Drains 'queued' workflow_runs rows that `enqueueRun` persisted and runs them
 * through the engine. This is the DURABILITY safety net: the run-now route
 * best-effort drains its own run inline via `after()`, but a run whose inline
 * drain never ran or crashed before claiming stays 'queued' (a committed row)
 * until a tick picks it up. Webhook / polling / scheduled runs rely on this tick
 * entirely (they have no request-scoped `after()`), so they are now durable too.
 *
 * Single-execution is guaranteed downstream: the engine claims each row via a
 * status-guarded UPDATE (queued -> running), so a race with the inline drain or
 * another tick resolves to one winner; the loser refuses as a duplicate.
 *
 * Wiring: scheduled every minute via `vercel.json` crons. Vercel cron sends GET
 * with `Authorization: Bearer $CRON_SECRET`; manual / curl invocations use POST
 * with the same header. Mirrors the other `/api/cron/*` routes.
 *
 * Optional `?limit=<n>` caps runs drained per tick (default DEFAULT_QUEUE_BATCH_LIMIT).
 *
 * Response shape — counts only (no run ids, which would leak workflow metadata
 * into the cron monitor): { ok, fetched, processed, failed, limit }.
 */

/** Upper bound (seconds) on the tick, covering the queued runs executed inline. */
export const maxDuration = 60;

/** Parse an optional positive-int `limit` query param; undefined when absent/invalid. */
function parseLimit(request: Request): number | undefined {
  const raw = new URL(request.url).searchParams.get("limit");
  if (raw === null) return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return undefined;
  return n;
}

async function handle(request: Request): Promise<Response> {
  const auth = requireCronAuth(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const limit = parseLimit(request) ?? DEFAULT_QUEUE_BATCH_LIMIT;

  try {
    const result = await processQueuedRuns({ limit });
    console.info(
      JSON.stringify({
        event: "cron.process_run_queue.done",
        fetched: result.fetched,
        processed: result.processed,
        failed: result.failed,
        limit,
      }),
    );
    return NextResponse.json({
      ok: true,
      fetched: result.fetched,
      processed: result.processed,
      failed: result.failed,
      limit,
    });
  } catch (err) {
    // Fail-safe: log + 500, never throw into the execution path.
    console.error(
      JSON.stringify({
        event: "cron.process_run_queue.fatal",
        message: (err as Error).message,
      }),
    );
    return NextResponse.json(
      { error: "Run-queue processor cron failed." },
      { status: 500 },
    );
  }
}

const wrapped = withCronHeartbeat("process-run-queue", handle);

export async function GET(request: Request): Promise<Response> {
  return wrapped(request);
}

export async function POST(request: Request): Promise<Response> {
  return wrapped(request);
}
