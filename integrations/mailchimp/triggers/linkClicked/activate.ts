import type { ActivationFn } from "@/services/triggers/activationRegistry";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { campaignsList } from "@/integrations/_shared/mailchimp/api/campaigns";
import { reportSummary } from "@/integrations/_shared/mailchimp/api/reports";
import { MissingDataCenterError } from "@/integrations/_shared/mailchimp/errors";

/**
 * Mailchimp `link_clicked` polling-trigger activation hook —
 * Slice 14 Commit 5.
 *
 * Captures the baseline `totalClicks` count per watched campaign.
 * Subsequent polls compare against the baseline; deltas drive
 * detail fetches.
 *
 * Same campaign-resolution rules as `email_opened`:
 *   - `campaignId` set → watch one.
 *   - Unset → watch 10 most-recent sent campaigns.
 */
export const activate: ActivationFn = async ({ node, integration }) => {
  const config = node.config as { campaignId?: string; url?: string };

  const dc = integration.accountMetadata.dc;
  if (typeof dc !== "string" || dc.length === 0) {
    throw new MissingDataCenterError();
  }

  let campaignIds: string[];
  if (config.campaignId) {
    campaignIds = [config.campaignId];
  } else {
    const campaigns = await refreshAndRetry({
      userId: integration.userId,
      provider: "mailchimp",
      accountId: integration.providerAccountId,
      apiCall: (accessToken) =>
        campaignsList({
          accessToken,
          dc,
          status: "sent",
          sortField: "send_time",
          sortDir: "DESC",
          count: 10,
        }),
    });
    campaignIds = campaigns
      .map((c) => c.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
  }

  const snapshotCampaigns: Record<string, { totalClicks: number }> = {};
  for (const campaignId of campaignIds) {
    try {
      const summary = await refreshAndRetry({
        userId: integration.userId,
        provider: "mailchimp",
        accountId: integration.providerAccountId,
        apiCall: (accessToken) =>
          reportSummary({ accessToken, dc, campaignId }),
      });
      snapshotCampaigns[campaignId] = {
        totalClicks: summary.clicks?.clicks_total ?? 0,
      };
    } catch (err) {
      console.warn(
        JSON.stringify({
          event: "mailchimp.activate.link_clicked.report_failed",
          campaignId,
          error: (err as Error).message,
        }),
      );
      snapshotCampaigns[campaignId] = { totalClicks: 0 };
    }
  }

  return {
    pollingEnabled: true,
    ...(config.campaignId !== undefined ? { campaignId: config.campaignId } : {}),
    ...(config.url !== undefined ? { url: config.url } : {}),
    snapshot: {
      campaigns: snapshotCampaigns,
      knownClicks: [],
      capturedAt: new Date().toISOString(),
    },
  };
};
