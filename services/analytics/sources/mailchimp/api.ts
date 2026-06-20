import { mailchimpRequest } from "@/integrations/_shared/mailchimp/api/_request";

/**
 * Bounded, READ-ONLY Mailchimp reader for the analytics source
 * (Slice ANALYTICS-SOURCES-MAILCHIMP-1).
 *
 * PRIVACY: this deliberately does NOT reuse the workflow `members` / report-detail
 * wrappers (those return subscriber emails / ids / per-member opens-clicks). It reads
 * ONLY aggregate counts via the proven `mailchimpRequest` helper (auth + dc-routing +
 * error mapping) with `fields=` projections so Mailchimp returns the minimum:
 *   - audience member count → `GET /lists/{id}?fields=stats.member_count`
 *   - sent-campaign counts/timing → `GET /campaigns?status=sent&since_send_time=…&
 *     before_send_time=…&fields=campaigns.send_time,total_items`
 * No subscriber email/name/id, merge field, segment, campaign subject/title/content,
 * or raw payload is ever read into a result or cached.
 *
 * No raw Mailchimp query comes from widget config: the audience id is a validated
 * token and the date window is built server-side from the dashboard range.
 */

export const PAGE_SIZE = 100; // Mailchimp count cap used across V2 wrappers.
/** ≤ 10 pages = 1000 campaigns scanned for the over-time series before truncation. */
export const MAX_PAGES = 10;

interface ListStatsResponse {
  stats?: { member_count?: unknown };
}

/**
 * Current member count of one audience. Reads ONLY `stats.member_count` (no member
 * data). Throws `Unauthorized401Error` / `NotFoundError` / generic `Error`; the
 * adapter classifies them.
 */
export async function fetchAudienceMemberCount(
  accessToken: string,
  dc: string,
  audienceId: string,
): Promise<number> {
  const query = new URLSearchParams({ fields: "stats.member_count" });
  const data = await mailchimpRequest<ListStatsResponse>({
    accessToken,
    dc,
    method: "GET",
    path: `/lists/${encodeURIComponent(audienceId)}`,
    query,
    resourceForNotFound: "audience",
  });
  const n = data.stats?.member_count;
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

export interface SentCampaignsScan {
  /** Send timestamps (epoch ms) of sent campaigns in the window (≤ scan cap). */
  sendMs: number[];
  /** Exact total of sent campaigns in the window (from `total_items`, scan-independent). */
  total: number;
  /** True when there were more campaigns in the window than the page cap. */
  truncated: boolean;
}

interface CampaignsResponse {
  campaigns?: Array<{ send_time?: unknown }>;
  total_items?: unknown;
}

function parseMs(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Scan sent campaigns in `[sinceIso, untilIso)`, collecting only `send_time` per
 * campaign + the window `total_items`. Exact `total` from `total_items` even when the
 * per-campaign scan truncates. Reads ONLY `campaigns.send_time` + `total_items`
 * (no subject/title/content/recipients). Throws `Unauthorized401Error` /
 * `NotFoundError` / generic `Error`; the adapter classifies them.
 */
export async function scanSentCampaigns(
  accessToken: string,
  dc: string,
  input: { sinceIso: string; untilIso: string; maxPages?: number },
): Promise<SentCampaignsScan> {
  const maxPages = input.maxPages ?? MAX_PAGES;
  const sendMs: number[] = [];
  let total = 0;

  for (let page = 0; page < maxPages; page++) {
    const query = new URLSearchParams({
      status: "sent",
      since_send_time: input.sinceIso,
      before_send_time: input.untilIso,
      fields: "campaigns.send_time,total_items",
      count: String(PAGE_SIZE),
      offset: String(page * PAGE_SIZE),
    });
    const data = await mailchimpRequest<CampaignsResponse>({
      accessToken,
      dc,
      method: "GET",
      path: "/campaigns",
      query,
      resourceForNotFound: "campaigns",
    });
    if (typeof data.total_items === "number") total = data.total_items;
    const batch = data.campaigns ?? [];
    for (const c of batch) {
      const ms = parseMs(c.send_time);
      if (ms !== null) sendMs.push(ms);
    }
    if (batch.length < PAGE_SIZE) return { sendMs, total, truncated: false };
    if (page === maxPages - 1) return { sendMs, total, truncated: total > sendMs.length };
  }

  return { sendMs, total, truncated: false };
}
