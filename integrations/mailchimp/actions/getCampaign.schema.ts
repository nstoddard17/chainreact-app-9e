import { z } from "zod";

/**
 * `get_campaign` action schema — Mailchimp 2.1 Commit 1.
 *
 * Single-record read from `/campaigns/{campaignId}`. V1 reference:
 * [`lib/workflows/actions/mailchimp/getCampaign.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp/getCampaign.ts).
 *
 * Strict shape — unknown fields throw. Pure read; no Q11 surface.
 */
export const GetCampaignConfigSchema = z
  .object({
    campaignId: z.string().min(1, "campaignId is required"),
  })
  .strict();

export type GetCampaignConfig = z.infer<typeof GetCampaignConfigSchema>;
