import { NextResponse } from "next/server";
import { AnalyticsRangeSchema } from "@/contracts/analytics";
import { getAnalyticsOverview } from "@/services/analytics/analyticsOverview";
import { requireAccount } from "../_shared";

/**
 * GET /api/analytics/data?range=7d (Slice ANALYTICS-1).
 *
 * Returns the computed, account-scoped `AnalyticsOverview` for the requested
 * range. Read-only; the scope is the caller's resolved ACTIVE account. All
 * underlying reads are account-filtered (runs / workflows / integrations); only
 * aggregate counts + safe names leave the server — no run payloads, tokens, or
 * provider account identifiers.
 */
export async function GET(request: Request) {
  const auth = await requireAccount();
  if (!auth.ok) return auth.response;

  const rangeParam = new URL(request.url).searchParams.get("range");
  const parsed = AnalyticsRangeSchema.safeParse(rangeParam ?? "7d");
  const range = parsed.success ? parsed.data : "7d";

  const overview = await getAnalyticsOverview(auth.accountId, range);
  return NextResponse.json({ overview });
}
