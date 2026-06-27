import { NextResponse } from "next/server";
import { requireCronAuth } from "@/services/cron/auth";
import {
  buildDefaultDeps,
  evaluateOpsAlerts,
} from "@/services/observability/opsAlertEvaluator";
import { withCronHeartbeat } from "@/services/observability/signalRecorders";

/**
 * Cron entrypoint for the ops-alert evaluator (Phase 8b launch alerts).
 *
 * Each tick reads the launch-readiness signals (stuck runs, provider failure
 * rate, OAuth refresh failures, billing webhook failures, cron failures, and —
 * when the durable-queue gate is on — queue backlog), applies the pure threshold
 * rules, dedupes/cooldowns against ops_alert_events, and delivers owner alerts
 * via structured log (always) + optional OPS_ALERT_WEBHOOK_URL. Also runs
 * retention on the two ops tables.
 *
 * Self-monitoring: wrapped in withCronHeartbeat so a dead evaluator surfaces on
 * the next live tick (its own heartbeat goes stale).
 *
 * Wiring: scheduled every 5 minutes in vercel.json. Vercel cron sends GET with
 * `Authorization: Bearer $CRON_SECRET`; manual/curl uses POST with the same
 * header. Mirrors the other /api/cron/ routes.
 *
 * Response shape — counts only (no run/account/provider ids): the evaluation
 * summary { fired, delivered, suppressed, resolved, queueMonitored, ... }.
 */

async function handle(request: Request): Promise<Response> {
  const auth = requireCronAuth(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  try {
    const nowIso = new Date().toISOString();
    const summary = await evaluateOpsAlerts(buildDefaultDeps(nowIso));
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "cron.evaluate_ops_alerts.fatal",
        message: (err as Error).message,
      }),
    );
    return NextResponse.json({ error: "Ops-alert evaluation failed." }, { status: 500 });
  }
}

const wrapped = withCronHeartbeat("evaluate-ops-alerts", handle);

export async function GET(request: Request): Promise<Response> {
  return wrapped(request);
}

export async function POST(request: Request): Promise<Response> {
  return wrapped(request);
}
