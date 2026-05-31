import type { ActivationFn } from "@/services/triggers/activationRegistry";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { campaignsList } from "@/integrations/_shared/mailchimp/api/campaigns";
import { reportSummary } from "@/integrations/_shared/mailchimp/api/reports";
import { MissingDataCenterError } from "@/integrations/_shared/mailchimp/errors";

/**
 * Mailchimp `email_opened` polling-trigger activation hook —
 * Slice 14 Commit 5.
 *
 * Captures the baseline `totalOpens` count for each watched campaign.
 * Subsequent polls compare against this baseline; only delta-opens
 * become events.
 *
 * Two modes:
 *   - `campaignId` set → baseline that one campaign only.
 *   - `campaignId` unset → baseline the most-recent 10 sent campaigns
 *     (matches V1 default behavior at MailchimpTriggerLifecycle.ts:562-577).
 *
 * V2 "first poll miss" rule honored: the baseline IS the activation
 * boundary. Opens that happen between activation and the first poll
 * are NOT emitted retroactively — V1 would re-trigger them on the
 * first delta detection.
 */
export const activate: ActivationFn = async ({ node, integration }) => {
  const config = node.config as { campaignId?: string };

  const dc = integration.accountMetadata.dc;
  if (typeof dc !== "string" || dc.length === 0) {
    throw new MissingDataCenterError();
  }

  // Determine which campaigns to baseline.
  let campaignIds: string[];
  if (config.campaignId) {
    campaignIds = [config.campaignId];
  } else {
    const campaigns = await refreshAndRetry({
      accountId: integration.accountId,
      provider: "mailchimp",
      providerAccountId: integration.providerAccountId,
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

  const snapshotCampaigns: Record<string, { totalOpens: number }> = {};
  for (const campaignId of campaignIds) {
    try {
      const summary = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "mailchimp",
        providerAccountId: integration.providerAccountId,
        apiCall: (accessToken) =>
          reportSummary({ accessToken, dc, campaignId }),
      });
      snapshotCampaigns[campaignId] = {
        totalOpens: summary.opens?.opens_total ?? 0,
      };
    } catch (err) {
      // A single campaign report failure shouldn't abort activation;
      // we record the campaign with 0 opens so the first poll's
      // delta = current count (no historical event storm).
      console.warn(
        JSON.stringify({
          event: "mailchimp.activate.email_opened.report_failed",
          campaignId,
          error: (err as Error).message,
        }),
      );
      snapshotCampaigns[campaignId] = { totalOpens: 0 };
    }
  }

  return {
    pollingEnabled: true,
    ...(config.campaignId !== undefined ? { campaignId: config.campaignId } : {}),
    snapshot: {
      campaigns: snapshotCampaigns,
      knownOpens: [],
      capturedAt: new Date().toISOString(),
    },
  };
};
