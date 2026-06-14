import { NextResponse } from "next/server";
import { requireCronAuth } from "@/services/cron/auth";
import { runSlackHealthCheck } from "@/services/integrations/slackHealthCheck";
import { DEFAULT_BATCH_LIMIT } from "./constants";

/**
 * Cron entrypoint for the proactive Slack connection health check (V2-READY-29).
 *
 * Slack bot tokens are not refreshable, so a stale/revoked token is otherwise
 * only discovered when a builder picker or action 401s. This sweep probes each
 * active Slack connection with the lightweight `auth.test` endpoint and drives
 * the existing V2-READY-28/28B mark/clear/notify path — surfacing "reconnect
 * Slack" BEFORE a run fails.
 *
 * Gated by `ENABLE_INTEGRATION_HEALTH_CHECK` (default OFF) — when off the service
 * is a no-op and this returns `enabled:false` with zero counts.
 *
 * NOT YET SCHEDULED: deliberately absent from `vercel.json` until the run
 * frequency is confirmed (see V2-READY-29 report). Vercel cron would send GET
 * with `Authorization: Bearer $CRON_SECRET`; manual / curl invocations use POST
 * with the same header. Mirrors the other `/api/cron/*` routes.
 *
 * Optional `?limit=<n>` caps rows probed per tick (defaults to
 * DEFAULT_BATCH_LIMIT so each tick stays bounded).
 *
 * To exercise locally:
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
 *        http://localhost:3000/api/cron/check-slack-health
 *
 * Response shape — numeric aggregate counts ONLY (no integration ids, tokens,
 * team ids, provider account ids, emails, scopes, or raw provider bodies):
 * { ok, enabled, checked, healthy, cleared, authFailed, markedNeedsReconnect,
 *   skipped, errors }.
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
    const result = await runSlackHealthCheck({ limit });
    // Summary log — aggregate counts only (no integration ids / provider data).
    console.info(
      JSON.stringify({
        event: "cron.check_slack_health.done",
        enabled: result.enabled,
        checked: result.checked,
        healthy: result.healthy,
        cleared: result.cleared,
        authFailed: result.authFailed,
        markedNeedsReconnect: result.markedNeedsReconnect,
        skipped: result.skipped,
        errors: result.errors,
        limit,
      }),
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    // Fail-safe: log + 500, never throw into anything.
    console.error(
      JSON.stringify({
        event: "cron.check_slack_health.fatal",
        message: (err as Error).message,
      }),
    );
    return NextResponse.json(
      { error: "Slack health-check cron failed." },
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
