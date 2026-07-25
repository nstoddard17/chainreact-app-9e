import { NextResponse } from "next/server";
import {
  ConnectedAnalyticsError,
  ConnectedAnalyticsQuerySchema,
} from "@/contracts/connectedAnalytics";
import { runConnectedAnalyticsQuery } from "@/services/analytics/insights/runConnectedQuery";
import { parseBody, requireAccount } from "../../_shared";

/**
 * POST /api/analytics/insights/query (Slice ANALYTICS-CONNECTED-DATA-CD-1).
 *
 * The provider-agnostic connected-analytics query route. Sibling of the CS-1
 * `POST /api/analytics/query` (which remains the internal engine's direct
 * interface — no breaking change). Thin: gate → strict parse → orchestrator →
 * serialize. Scope is ALWAYS the caller's membership-resolved active account;
 * no account/user/connection id is accepted from the client. Typed errors map
 * to fixed-copy 400s (UNKNOWN_ENTITY never echoes ids — same non-leak posture
 * as CS-1's UNKNOWN_WORKFLOW); anything else is a generic 500.
 */
export async function POST(request: Request) {
  const auth = await requireAccount();
  if (!auth.ok) return auth.response;

  const body = await parseBody(request, ConnectedAnalyticsQuerySchema);
  if (!body.ok) return body.response;

  const refresh = new URL(request.url).searchParams.get("refresh") === "1";
  try {
    const result = await runConnectedAnalyticsQuery(
      { accountId: auth.accountId, userId: auth.userId },
      body.data,
      { refresh },
    );
    return NextResponse.json({ result });
  } catch (err) {
    if (err instanceof ConnectedAnalyticsError) {
      if (err.code === "UNKNOWN_ENTITY") {
        return NextResponse.json(
          { error: "One or more selected items were not found.", code: "UNKNOWN_ENTITY" },
          { status: 400 },
        );
      }
      if (err.code === "RATE_LIMITED") {
        // Provider 429s OR ChainReact's protective limiter; retry hint when known.
        return NextResponse.json(
          {
            error: err.message,
            code: err.code,
            ...(err.retryAfterSeconds !== undefined
              ? { retryAfterSeconds: err.retryAfterSeconds }
              : {}),
          },
          { status: 429 },
        );
      }
      return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
    }
    console.error("POST /api/analytics/insights/query failed", err);
    return NextResponse.json(
      { error: "Analytics query failed.", code: "ANALYTICS_QUERY_FAILED" },
      { status: 500 },
    );
  }
}
