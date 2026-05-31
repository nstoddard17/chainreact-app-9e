import { NextResponse } from "next/server";
import { requireUser } from "@/app/api/providers/_shared";
import { getAiAnalyticsForAccount } from "@/services/analytics/aiAnalyticsReport";
import { ensurePersonalAccount } from "@/services/accounts/ensurePersonalAccount";

/**
 * GET /api/ai/usage — ACCOUNT AI analytics (Slice 4.AI-12; account-scoped in
 * 4.ACCOUNT-MODEL-9d).
 *
 * READ-ONLY. Returns the caller's ACCOUNT's AI analytics, folded from the
 * COST-6 `ai_cost_events` ledger via COST-7's `ownerAiStats` folds. It makes NO
 * model call, NEVER writes the ledger, and never mutates a workflow.
 *
 * SCOPE / AUTH DECISION (honest): gated by `requireUser`; resolves the caller's
 * personal account (until the switcher ships) and loads via the membership-RLS-
 * gated `listByAccount`, so it can only ever see the caller's own account's
 * events — never another account's. A cross-account owner/admin analytics route
 * over the service-role `listEventsForAnalytics` is intentionally NOT shipped:
 * V2 has no admin/owner authorization convention yet.
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
    const account = await ensurePersonalAccount(auth.userId);
    report = await getAiAnalyticsForAccount({ accountId: account.id, from, to, limit });
  } catch {
    // Sanitized — never leak internals / connection strings / stack traces.
    return NextResponse.json({ error: "Failed to load AI analytics." }, { status: 500 });
  }

  return NextResponse.json({
    range: { from, to },
    scope: "account",
    ...report,
  });
}
