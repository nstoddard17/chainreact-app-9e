import { NextResponse } from "next/server";
import { requireCronAuth } from "@/services/cron/auth";
import { withCronHeartbeat } from "@/services/observability/signalRecorders";
import { runScheduledTriggers } from "@/services/cron/runScheduledTriggers";
// Side-effect import: forces all provider + native registrations at
// module load. The native scheduledTrigger registration is included
// in integrations/_registry.ts. Mirrors the pattern at
// app/api/cron/poll-triggers/route.ts.
import "@/integrations/_registry";

/**
 * Cron entrypoint for native:scheduled_trigger.
 *
 * Per docs/slices/parity/native-nodes-2-tier-b-triggers-plan.md §5.6.
 *
 * GET + POST both delegate (Vercel cron sends GET; manual invocations
 * use POST). Auth via shared `requireCronAuth` (Authorization: Bearer
 * $CRON_SECRET).
 *
 * Recommended Vercel cron cadence: every minute.
 *
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
 *        http://localhost:3000/api/cron/run-scheduled-triggers
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
    const result = await runScheduledTriggers();
    // V2-READY-39 — structured per-tick summary so the aggregate counts (incl.
    // `errors`) reach the logs (Vercel does not log the JSON response body).
    // Counts-only — no workflow/account ids.
    console.info(
      JSON.stringify({ event: "cron.run_scheduled_triggers.done", ...result }),
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    // Don't surface internals — log structured + return generic 500.
    console.error(
      JSON.stringify({
        event: "cron.run_scheduled_triggers.fatal",
        message: (err as Error).message,
      }),
    );
    return NextResponse.json(
      { error: "Scheduled-triggers cron failed." },
      { status: 500 },
    );
  }
}

const wrapped = withCronHeartbeat("run-scheduled-triggers", handle);

export async function GET(request: Request): Promise<Response> {
  return wrapped(request);
}

export async function POST(request: Request): Promise<Response> {
  return wrapped(request);
}
