import { z } from "zod";

/**
 * `get_campaign_stats` action schema — Mailchimp 2.1 Commit 1.
 *
 * Single-record read from `/reports/{campaignId}`. V1 reference:
 * [`lib/workflows/actions/mailchimp/getCampaignStats.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp/getCampaignStats.ts).
 *
 * V1 issues two API calls (campaign GET → conditional report GET).
 * V2 collapses to one call against `/reports/{id}` directly — Mailchimp
 * surfaces all the documented stats fields there for sent campaigns;
 * unsent campaigns return 404 which surfaces as `NotFoundError` from
 * the shared request helper.
 *
 * Strict shape — unknown fields throw. Pure read; no Q11 surface.
 */
export const GetCampaignStatsConfigSchema = z
  .object({
    campaignId: z.string().min(1, "campaignId is required"),
  })
  .strict();

export type GetCampaignStatsConfig = z.infer<
  typeof GetCampaignStatsConfigSchema
>;
