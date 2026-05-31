import type { ActivationFn } from "@/services/triggers/activationRegistry";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { campaignsList } from "@/integrations/_shared/mailchimp/api/campaigns";
import { MissingDataCenterError } from "@/integrations/_shared/mailchimp/errors";

/**
 * Mailchimp `campaign_created` polling-trigger activation hook —
 * Slice 14 Commit 5.
 *
 * Captures the baseline set of campaign ids at activation time so
 * the first poll after activation does NOT emit historical events.
 * V2 "first poll miss" rule: activation IS the baseline boundary;
 * if the baseline fetch fails, activation throws and the trigger
 * never registers.
 *
 * Filter parity with the poll handler: same `status` / `audienceId`
 * (if either set) is applied at the API call. The baseline must
 * represent the SAME query the poll handler runs on subsequent
 * ticks, otherwise the first diff will fire on every pre-existing
 * campaign that matches the poll filter.
 *
 * dc + accountId resolved here so a misconfigured integration fails
 * at activation rather than at poll time.
 */
export const activate: ActivationFn = async ({ node, integration }) => {
  const config = node.config as {
    audienceId?: string;
    status?: string;
  };

  const dc = integration.accountMetadata.dc;
  if (typeof dc !== "string" || dc.length === 0) {
    throw new MissingDataCenterError();
  }

  // Baseline: fetch the most-recent 100 campaigns matching the
  // filter. 100 is the API cap; sufficient for the baseline of a
  // typical Mailchimp account (campaign volume is low relative to
  // subscriber volume).
  const campaigns = await refreshAndRetry({
    accountId: integration.accountId,
    provider: "mailchimp",
    providerAccountId: integration.providerAccountId,
    apiCall: (accessToken) =>
      campaignsList({
        accessToken,
        dc,
        ...(config.status ? { status: config.status } : {}),
        ...(config.audienceId ? { listId: config.audienceId } : {}),
        sortField: "create_time",
        sortDir: "DESC",
        count: 100,
      }),
  });

  // Stable sort for JSONB equality across snapshot writes.
  const knownCampaignIds = campaigns
    .map((c) => c.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0)
    .sort();

  return {
    pollingEnabled: true,
    snapshot: {
      knownCampaignIds,
      capturedAt: new Date().toISOString(),
    },
    // Preserve the original filter fields so the poll handler sees
    // them on every tick (lifecycle merges this patch into the node
    // config; explicit echo keeps the snapshot + filter aligned).
    ...(config.audienceId !== undefined ? { audienceId: config.audienceId } : {}),
    ...(config.status !== undefined ? { status: config.status } : {}),
  };
};
