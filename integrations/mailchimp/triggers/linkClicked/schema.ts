import { z } from "zod";

/**
 * Zod schema for the Mailchimp `link_clicked` polling trigger config —
 * Slice 14 Commit 5.
 *
 * Validation rules:
 *   - `campaignId`: OPTIONAL. When set, watches one campaign only.
 *   - `url`: OPTIONAL filter. When set, only clicks on this exact
 *     URL fire the trigger. (Mailchimp returns the URL string
 *     verbatim in `urls_clicked[]`.)
 *   - `snapshot.campaigns[campaignId].totalClicks`: per-campaign
 *     totalClicks count for delta detection.
 *   - `snapshot.knownClicks`: set of `${campaignId}:${urlId}:${email}`
 *     keys that have already fired. Per-(campaign, URL, subscriber)
 *     dedup.
 *   - `pollingEnabled` / `polling.lastPolledAt`: polling boilerplate.
 */
export const LinkClickedConfigSchema = z.object({
  campaignId: z.string().min(1).optional(),
  url: z.string().min(1).optional(),
  pollingEnabled: z.boolean().default(false),
  snapshot: z
    .object({
      campaigns: z.record(
        z.string().min(1),
        z.object({ totalClicks: z.number().int().nonnegative() }),
      ),
      knownClicks: z.array(z.string().min(1)).default([]),
      capturedAt: z.string().min(1),
    })
    .optional(),
  polling: z
    .object({
      lastPolledAt: z.string().min(1),
    })
    .optional(),
});
export type LinkClickedConfig = z.infer<typeof LinkClickedConfigSchema>;
