import { NextResponse } from "next/server";
import { requireUser } from "@/app/api/providers/_shared";
import { getAiAnalyticsForUser } from "@/services/analytics/aiAnalyticsReport";

/**
 * GET /api/ai/usage — CURRENT-USER AI analytics (Slice 4.AI-12).
 *
 * READ-ONLY. Returns the authenticated caller's OWN AI analytics, folded from the
 * COST-6 `ai_cost_events` ledger via COST-7's `ownerAiStats` folds. It makes NO
 * model call, NEVER writes the ledger, and never mutates a workflow.
 *
 * SCOPE / AUTH DECISION (honest): this route is gated by `requireUser` and is
 * scoped to the caller (`getAiAnalyticsForUser` loads via the RLS-gated
 * `listByUser`). It is NOT owner-wide. A cross-user owner/admin analytics route
 * (`GET /api/admin/ai/analytics` over the service-role `listEventsForAnalytics`)
 * is intentionally NOT shipped here: V2 has no admin/owner authorization
 * convention yet, and exposing cross-user analytics behind `requireUser` alone
 * would be unsafe. That route is BLOCKED until an admin gate exists.
 *
 * No-leak: the response carries only counts / enums / model+feature names /
 * token+latency+cost numbers / ranges — never raw prompts, completions, config
 * values, secrets, or provider bodies (the COST-7 folds never read metadata
 * VALUES).
 */

const DAY_MS = 86_400_000;
const DEFAULT_DAYS = 30;
const MAX_DAYS = 365;
const DEFAULT_LIMIT = 2_000;
const MAX_LIMIT = 5_000;

function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function GET(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const params = new URL(request.url).searchParams;
  const fromParam = params.get("from");
  const toParam = params.get("to");
  const daysParam = params.get("days");
  const limitParam = params.get("limit");
  const now = Date.now();

  let fromMs: number;
  let toMs: number;

  if (fromParam !== null || toParam !== null) {
    toMs = toParam !== null ? Date.parse(toParam) : now;
    fromMs = fromParam !== null ? Date.parse(fromParam) : now - DEFAULT_DAYS * DAY_MS;
    if (Number.isNaN(fromMs) || Number.isNaN(toMs)) {
      return badRequest("Invalid 'from'/'to' date — use an ISO timestamp.");
    }
    if (fromMs > toMs) {
      return badRequest("'from' must be on or before 'to'.");
    }
  } else if (daysParam !== null) {
    const days = Number(daysParam);
    if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) {
      return badRequest(`'days' must be an integer between 1 and ${MAX_DAYS}.`);
    }
    toMs = now;
    fromMs = now - days * DAY_MS;
  } else {
    toMs = now;
    fromMs = now - DEFAULT_DAYS * DAY_MS;
  }

  let limit = DEFAULT_LIMIT;
  if (limitParam !== null) {
    const n = Number(limitParam);
    if (!Number.isInteger(n) || n < 1 || n > MAX_LIMIT) {
      return badRequest(`'limit' must be an integer between 1 and ${MAX_LIMIT}.`);
    }
    limit = n;
  }

  const from = new Date(fromMs).toISOString();
  const to = new Date(toMs).toISOString();

  let report;
  try {
    report = await getAiAnalyticsForUser({ userId: auth.userId, from, to, limit });
  } catch {
    // Sanitized — never leak internals / connection strings / stack traces.
    return NextResponse.json({ error: "Failed to load AI analytics." }, { status: 500 });
  }

  return NextResponse.json({
    range: { from, to },
    scope: "current_user",
    ...report,
  });
}
