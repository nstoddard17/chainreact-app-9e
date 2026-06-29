import { NextResponse } from "next/server";
import { requireCronAuth } from "@/services/cron/auth";
import { withCronHeartbeat } from "@/services/observability/signalRecorders";
import { sweepStaleRunningWorkflowRuns } from "@/services/execution/staleWorkflowRunSweep";
import { sweepStaleQueuedWorkflowRuns } from "@/services/execution/staleQueuedRunSweep";
import { DEFAULT_BATCH_LIMIT } from "./constants";

/**
 * Cron entrypoint for the stale-'running' workflow-run sweep (Slice 4.COST-15K).
 *
 * Crash recovery for the COST-15C pre-run-row lifecycle: a process that dies
 * between `createWorkflowRunStart` and finalize leaves a row stuck in
 * status='running' (hidden from the UI by the running-row read filter). This
 * tick marks such rows failed once they pass the staleness cutoff (default 60
 * min, by `started_at`), so they finalize like any other failed run.
 *
 * LIFECYCLE CLEANUP ONLY — it does NOT change billing: no balance mutation, no
 * reserve/reconcile RPC, no task_usage_events. It is SEPARATE from the
 * release-expired-reservations sweep (which reclaims reserved BILLING HOLDS).
 *
 * Wiring (Slice 4.COST-15K): scheduled every 10 min via `vercel.json` crons.
 * Vercel cron sends GET with `Authorization: Bearer $CRON_SECRET`; manual /
 * curl invocations use POST with the same header. Mirrors the other
 * `/api/cron/*` routes.
 *
 * Optional `?limit=<n>` query param caps rows swept per tick (defaults to
 * DEFAULT_BATCH_LIMIT so each tick stays bounded). `older-than-minutes` is the
 * service default (60); change it there if a different cutoff is accepted.
 *
 * To exercise locally:
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
 *        http://localhost:3000/api/cron/sweep-stale-runs
 *
 * Response shape — counts only (no run ids; those would leak workflow metadata
 * into the cron monitor): { ok, sweptCount, cutoff, olderThanMs }.
 */

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

  const limit = parseLimit(request) ?? DEFAULT_BATCH_LIMIT;

  try {
    // The reaper finalizes BOTH stale lifecycle states: 'running' rows whose
    // engine restarted mid-execution (60-min default) and 'queued' rows the
    // processor never claimed (30-min default) — so a wedged worker never leaves
    // runs hanging 'queued' forever.
    const result = await sweepStaleRunningWorkflowRuns({ limit });
    const queued = await sweepStaleQueuedWorkflowRuns({ limit });
    // Summary log — counts + cutoff window only (no run ids).
    console.info(
      JSON.stringify({
        event: "cron.sweep_stale_runs.done",
        sweptCount: result.sweptCount,
        queuedSweptCount: queued.sweptCount,
        cutoff: result.cutoff,
        queuedCutoff: queued.cutoff,
        olderThanMs: result.olderThanMs,
        queuedOlderThanMs: queued.olderThanMs,
        limit,
      }),
    );
    return NextResponse.json({
      ok: true,
      sweptCount: result.sweptCount,
      queuedSweptCount: queued.sweptCount,
      cutoff: result.cutoff,
      olderThanMs: result.olderThanMs,
    });
  } catch (err) {
    // Fail-safe: log + 500, never throw into the execution path.
    console.error(
      JSON.stringify({
        event: "cron.sweep_stale_runs.fatal",
        message: (err as Error).message,
      }),
    );
    return NextResponse.json(
      { error: "Stale-run sweep cron failed." },
      { status: 500 },
    );
  }
}

const wrapped = withCronHeartbeat("sweep-stale-runs", handle);

export async function GET(request: Request): Promise<Response> {
  return wrapped(request);
}

export async function POST(request: Request): Promise<Response> {
  return wrapped(request);
}
