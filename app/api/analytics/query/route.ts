import { NextResponse } from "next/server";
import { AnalyticsQuerySchema } from "@/contracts/analyticsQuery";
import {
  AnalyticsQueryError,
  UNKNOWN_WORKFLOW_MESSAGE,
  runAnalyticsQuery,
} from "@/services/analytics/insightQuery";
import { parseBody, requireAccount } from "../_shared";

/**
 * POST /api/analytics/query (Slice ANALYTICS-FLEXIBILITY-CS-1).
 *
 * The typed, server-owned flexible analytics query path. Thin by design:
 * gate → strict parse → service → serialize.
 *
 *   - Scope is ALWAYS the caller's membership-resolved active account
 *     (`requireAccount`) — no account id is accepted from the client.
 *   - The body is `.strict()` Zod — unknown keys 400. Cross-field validity
 *     (capability matrix) and workflow OWNERSHIP are enforced by the service;
 *     nonexistent and cross-account workflow ids return ONE identical
 *     non-leaking 400 (`UNKNOWN_WORKFLOW`, fixed message, no ids echoed).
 *   - Unexpected failures → generic 500; SQL/provider/internal detail stays in
 *     server logs only.
 *
 * POST (not GET): filter/series arrays don't belong in querystrings, and this
 * read is never cached at the HTTP layer.
 */
export async function POST(request: Request) {
  const auth = await requireAccount();
  if (!auth.ok) return auth.response;

  const body = await parseBody(request, AnalyticsQuerySchema);
  if (!body.ok) return body.response;

  try {
    const result = await runAnalyticsQuery(auth.accountId, body.data);
    return NextResponse.json({ result });
  } catch (err) {
    if (err instanceof AnalyticsQueryError) {
      if (err.code === "UNKNOWN_WORKFLOW") {
        // Fixed copy — never the thrown message, never which id failed or why.
        return NextResponse.json(
          { error: UNKNOWN_WORKFLOW_MESSAGE, code: "UNKNOWN_WORKFLOW" },
          { status: 400 },
        );
      }
      return NextResponse.json(
        { error: err.message, code: "INVALID_QUERY" },
        { status: 400 },
      );
    }
    console.error("POST /api/analytics/query failed", err);
    return NextResponse.json(
      { error: "Analytics query failed.", code: "ANALYTICS_QUERY_FAILED" },
      { status: 500 },
    );
  }
}
