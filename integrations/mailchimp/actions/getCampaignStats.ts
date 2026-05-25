import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { reportGet } from "../../_shared/mailchimp/api/reports";
import { resolveDc } from "./_resolveDc";
import { GetCampaignStatsConfigSchema } from "./getCampaignStats.schema";

/**
 * Mailchimp `get_campaign_stats` action handler — Mailchimp 2.1 Commit 1.
 *
 * GETs `/reports/{campaignId}` via the `reportGet` wrapper (which is
 * the same wire path as `reportSummary` — see reports.ts doc-comment).
 * Pure read; no Q11 surface.
 *
 * **Bounded output projection** — no raw Mailchimp body spread.
 * Nested `opens` / `clicks` / `bounces` / `forwards` / `industryStats`
 * envelopes are projected to bounded sub-shapes; missing fields
 * default to 0 / null so downstream nodes get predictable types.
 *
 * Unsent campaigns: Mailchimp returns 404 for `/reports/{id}` if the
 * campaign hasn't been sent. That surfaces as `NotFoundError` from
 * the shared request helper — workflow authors branch on the error
 * (consistent with `get_campaign` / `get_subscriber`).
 */
export const getCampaignStats: ActionHandler = async (input) => {
  const config = GetCampaignStatsConfigSchema.parse(input.config);

  const { dc, accountId } = await resolveDc({
    userId: input.userId,
    triggerEvent: input.triggerEvent,
  });

  const report = await refreshAndRetry({
    userId: input.userId,
    provider: "mailchimp",
    accountId,
    apiCall: (accessToken) =>
      reportGet({
        accessToken,
        dc,
        campaignId: config.campaignId,
      }),
  });

  const industry = report.industry_stats;

  return {
    output: {
      campaignId: report.id,
      emailsSent: report.emails_sent ?? 0,
      abuseReports: report.abuse_reports ?? 0,
      unsubscribed: report.unsubscribed ?? 0,
      sendTime: report.send_time ?? null,
      opens: {
        opensTotal: report.opens?.opens_total ?? 0,
        uniqueOpens: report.opens?.unique_opens ?? 0,
      },
      clicks: {
        clicksTotal: report.clicks?.clicks_total ?? 0,
        uniqueClicks: report.clicks?.unique_clicks ?? 0,
      },
      bounces: {
        hardBounces: report.bounces?.hard_bounces ?? 0,
        softBounces: report.bounces?.soft_bounces ?? 0,
      },
      forwards: {
        forwardsCount: report.forwards?.forwards_count ?? 0,
        forwardsOpens: report.forwards?.forwards_opens ?? 0,
      },
      industryStats: industry
        ? {
            type: industry.type ?? null,
            openRate: industry.open_rate ?? null,
            clickRate: industry.click_rate ?? null,
            bounceRate: industry.bounce_rate ?? null,
            unopenRate: industry.unopen_rate ?? null,
            unsubRate: industry.unsub_rate ?? null,
            abuseRate: industry.abuse_rate ?? null,
          }
        : null,
    },
  };
};
