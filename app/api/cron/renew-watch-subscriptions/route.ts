import { NextResponse } from "next/server";
import { requireCronAuth } from "@/services/cron/auth";
import { withCronHeartbeat } from "@/services/observability/signalRecorders";
import { runRenewals } from "@/services/triggers/runRenewals";
// Side-effect import: forces subscription handler registrations at module
// load. Without this, runRenewals() would find rows but no handlers and
// skip everything.
import "@/integrations/_registry";

/**
 * Cron entrypoint for subscription-watch renewals.
 *
 * Vercel cron sends GET; manual / curl invocations use POST. Both delegate
 * to the same handler.
 *
 * Wired in vercel.json at every 10 minutes (`* /10 * * * *` minus the
 * space) — enough cushion for Calendar's 7-day expiry with the 24h
 * renewal threshold.
 *
 * To exercise locally:
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
 *        http://localhost:3000/api/cron/renew-watch-subscriptions
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
    const result = await runRenewals();
    // V2-READY-39 — structured per-tick summary so the aggregate counts (incl.
    // `errors` from failed renewals — a silent renewal failure means a watch
    // subscription quietly expires) reach the logs. Counts-only — no ids.
    console.info(
      JSON.stringify({ event: "cron.renew_watch_subscriptions.done", ...result }),
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "cron.renew_watch_subscriptions.fatal",
        message: (err as Error).message,
      }),
    );
    return NextResponse.json(
      { error: "Renewal cron failed." },
      { status: 500 },
    );
  }
}

const wrapped = withCronHeartbeat("renew-watch-subscriptions", handle);

export async function GET(request: Request): Promise<Response> {
  return wrapped(request);
}

export async function POST(request: Request): Promise<Response> {
  return wrapped(request);
}
