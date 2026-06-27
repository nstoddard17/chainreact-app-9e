import { NextResponse } from "next/server";
import { requireCronAuth } from "@/services/cron/auth";
import { withCronHeartbeat } from "@/services/observability/signalRecorders";
import { releaseExpiredBillingReservations } from "@/services/billing/reserveReconcileBilling";

/**
 * Cron entrypoint for the expired-reservation release sweep (Slice 4.COST-15K).
 *
 * Reclaims orphaned billing holds: runs stuck in billing_status='reserved' past
 * their `reservation_expires_at` (the engine crashed between reserve and
 * reconcile, COST-15H). Each is released — owner's `tasks_reserved` decremented,
 * run marked 'released' — via the COST-12 `release_expired_reservations` RPC
 * (wrapped by the COST-13 `releaseExpiredBillingReservations` service).
 *
 * NOT flag-gated: the sweep is a janitor and is safe to run anytime (no-op when
 * nothing is expired), so a `ENABLE_RESERVE_RECONCILE_BILLING` rollback can
 * never strand reserved tasks. service_role only (the service → repo → RPC use
 * the service-role client); this route is the only public surface and is
 * cron-auth protected.
 *
 * SEPARATE from the stale-run sweep (`/api/cron/sweep-stale-runs`), which
 * reclaims run-LIFECYCLE state (`status='running'`) and never touches billing.
 *
 * Wiring (Slice 4.COST-15K): scheduled every 10 min via `vercel.json` crons.
 * Vercel cron sends GET with `Authorization: Bearer $CRON_SECRET`; manual /
 * curl invocations use POST. Mirrors the other `/api/cron/*` routes.
 *
 * To exercise locally:
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
 *        http://localhost:3000/api/cron/release-expired-reservations
 *
 * Response shape — counts only: { ok, releasedCount, releasedTasks }.
 */

async function handle(request: Request): Promise<Response> {
  const auth = requireCronAuth(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  try {
    const result = await releaseExpiredBillingReservations();
    if (!result.ok) {
      // The service catches RPC errors and returns ok:false (never throws);
      // surface as a 500 so the cron monitor flags it.
      console.error(
        JSON.stringify({
          event: "cron.release_expired_reservations.error",
          reason: result.reason,
          ...(result.error ? { message: result.error } : {}),
        }),
      );
      return NextResponse.json(
        { error: "Expired-reservation sweep cron failed." },
        { status: 500 },
      );
    }
    console.info(
      JSON.stringify({
        event: "cron.release_expired_reservations.done",
        releasedCount: result.releasedCount,
        releasedTasks: result.releasedTasks,
      }),
    );
    return NextResponse.json({
      ok: true,
      releasedCount: result.releasedCount,
      releasedTasks: result.releasedTasks,
    });
  } catch (err) {
    // Defensive fail-safe (the service shouldn't throw, but never let a cron
    // tick crash the process).
    console.error(
      JSON.stringify({
        event: "cron.release_expired_reservations.fatal",
        message: (err as Error).message,
      }),
    );
    return NextResponse.json(
      { error: "Expired-reservation sweep cron failed." },
      { status: 500 },
    );
  }
}

const wrapped = withCronHeartbeat("release-expired-reservations", handle);

export async function GET(request: Request): Promise<Response> {
  return wrapped(request);
}

export async function POST(request: Request): Promise<Response> {
  return wrapped(request);
}
