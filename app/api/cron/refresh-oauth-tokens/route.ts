import { NextResponse } from "next/server";
import { requireCronAuth } from "@/services/cron/auth";
import { withCronHeartbeat } from "@/services/observability/signalRecorders";
import { runTokenRefreshSweep } from "@/services/integrations/tokenRefreshSweep";
import { DEFAULT_BATCH_LIMIT } from "./constants";

/**
 * Cron entrypoint for the proactive OAuth token refresh sweep
 * (Phase 8 / OAUTH-REFRESH-RELIABILITY-1).
 *
 * Refreshes refreshable integrations BEFORE their access token expires
 * (30-minute window, already-expired rows included) so users never re-auth
 * unless the provider truly revoked access — see
 * docs/slices/phase-8/oauth-refresh-reliability-audit.md for the audit that
 * motivated this. Scheduled every 10 minutes in `vercel.json`, so each token
 * gets ~3 attempts inside its window before hard expiry (transient-failure
 * tolerance). Monitored by `evaluate-ops-alerts` via the cron heartbeat.
 *
 * NOT feature-flagged on purpose: its failure modes are conservative (transient
 * errors change nothing; durable dead grants get the same one-shot
 * mark/notify the reactive path already produces).
 *
 * Vercel cron sends GET with `Authorization: Bearer $CRON_SECRET`; manual /
 * curl invocations use POST with the same header:
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
 *        http://localhost:3000/api/cron/refresh-oauth-tokens
 *
 * Optional `?limit=<n>` caps rows processed per tick (defaults to
 * DEFAULT_BATCH_LIMIT).
 *
 * Response shape — numeric aggregate counts ONLY (no integration ids, tokens,
 * provider account ids, emails, scopes, or raw provider bodies):
 * { ok, due, scanned, refreshed, skippedNonRefreshable, skippedNoRefreshToken,
 *   actionRequired, markedNeedsReconnect, skippedFrozen, failed,
 *   startedAt, finishedAt }.
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
  const startedAt = new Date().toISOString();

  try {
    const result = await runTokenRefreshSweep({ limit });
    const finishedAt = new Date().toISOString();
    // Summary log — aggregate counts only (no integration ids / provider data).
    console.info(
      JSON.stringify({
        event: "cron.refresh_oauth_tokens.done",
        ...result,
        limit,
        startedAt,
        finishedAt,
      }),
    );
    return NextResponse.json({ ok: true, ...result, startedAt, finishedAt });
  } catch (err) {
    // Fail-safe: log + 500 (heartbeat records `failed`), never throw upward.
    console.error(
      JSON.stringify({
        event: "cron.refresh_oauth_tokens.fatal",
        message: (err as Error).message,
      }),
    );
    return NextResponse.json(
      { error: "OAuth token refresh cron failed." },
      { status: 500 },
    );
  }
}

const wrapped = withCronHeartbeat("refresh-oauth-tokens", handle);

export async function GET(request: Request): Promise<Response> {
  return wrapped(request);
}

export async function POST(request: Request): Promise<Response> {
  return wrapped(request);
}
