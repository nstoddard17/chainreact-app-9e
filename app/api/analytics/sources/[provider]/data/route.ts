import { NextResponse } from "next/server";
import { AnalyticsRangeSchema } from "@/contracts/analytics";
import { queryAnalyticsSource } from "@/services/analytics/sources/querySource";
import { AnalyticsSourceError } from "@/services/analytics/sources/types";
import { computeRangeWindow } from "@/services/analytics/analyticsOverview";
import { requireAccount } from "../../../_shared";

/**
 * GET /api/analytics/sources/[provider]/data (Slice ANALYTICS-SOURCES-GITHUB-UI-1).
 *
 * Runs a registered analytics source for a connected-app widget. Auth + active
 * account come from the SESSION (never request input); the resolved `userId` is
 * passed as the source context so PERSONAL-credential providers (GitHub) use the
 * CALLING member's OWN connection — never a co-member's (the cache key + RLS also
 * enforce this).
 *
 * Outcomes:
 *   - 401 unauthenticated / 403 frozen-or-non-member (request-level) → handled by
 *     `requireAccount`.
 *   - 400 missing `metric` param (malformed request).
 *   - 200 `{ ok: true, result }` on success.
 *   - 200 `{ ok: false, code, message }` for every source-level outcome
 *     (UNKNOWN_SOURCE / UNKNOWN_METRIC / INVALID_QUERY / MISSING_CREDENTIAL /
 *     RATE_LIMITED / PROVIDER_ERROR) so ONE failing widget renders a safe state
 *     instead of crashing the dashboard. Raw provider text / tokens / payloads
 *     never leave the server (the adapter already returns safe, typed messages).
 *
 * No trigger/action/node execution — `queryAnalyticsSource` only reaches read-only
 * source adapters via the registry.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const auth = await requireAccount();
  if (!auth.ok) return auth.response;

  const { provider } = await params;
  const url = new URL(request.url);
  const metric = url.searchParams.get("metric");
  if (!metric) {
    return NextResponse.json(
      { error: "A metric is required.", code: "MISSING_METRIC" },
      { status: 400 },
    );
  }

  const rangeParsed = AnalyticsRangeSchema.safeParse(url.searchParams.get("range") ?? "7d");
  const range = rangeParsed.success ? rangeParsed.data : "7d";
  const groupBy = url.searchParams.get("groupBy");
  const refresh = url.searchParams.get("refresh") === "1";

  // Collect the allow-listed filter params present on the request. Each KEY is
  // re-validated against the metric's `supportedFilters` inside
  // `queryAnalyticsSource` (unsupported key → INVALID_QUERY), and each VALUE is
  // validated by the adapter — so this is just transport, never trust.
  const FILTER_PARAMS = ["repo", "channel", "keyword", "calendar", "label", "folder", "outlook_calendar", "board", "airtable_base", "airtable_table", "monday_board", "hubspot_pipeline", "mailchimp_audience", "dropbox_folder", "onedrive_folder", "gdrive_folder", "discord_guild", "discord_channel"] as const;
  const filters: Record<string, string> = {};
  for (const key of FILTER_PARAMS) {
    const value = url.searchParams.get(key);
    if (value) filters[key] = value;
  }

  const win = computeRangeWindow(range, Date.now());

  try {
    const result = await queryAnalyticsSource(
      {
        providerKey: provider,
        metricKey: metric,
        range: {
          since: new Date(win.since).toISOString(),
          until: new Date(win.until).toISOString(),
        },
        ...(groupBy ? { groupBy } : {}),
        ...(Object.keys(filters).length > 0 ? { filters } : {}),
        context: { accountId: auth.accountId, userId: auth.userId },
      },
      { refresh },
    );
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    if (err instanceof AnalyticsSourceError) {
      // Safe, typed widget-level outcome — never a page crash, never raw leak.
      return NextResponse.json({ ok: false, code: err.code, message: err.message });
    }
    // Unexpected — log raw server-side only; return a generic widget error.
    console.error(
      JSON.stringify({
        event: "analytics.source.unexpected_error",
        provider,
        metric,
        message: err instanceof Error ? err.message : String(err),
      }),
    );
    return NextResponse.json({
      ok: false,
      code: "PROVIDER_ERROR",
      message: "Couldn't load this data right now.",
    });
  }
}
