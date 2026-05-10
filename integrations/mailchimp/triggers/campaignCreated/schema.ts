import { z } from "zod";

/**
 * Zod schema for the Mailchimp `campaign_created` polling trigger
 * config — Slice 14 Commit 5.
 *
 * Validation rules:
 *   - `audienceId`: OPTIONAL filter. When set, the trigger only fires
 *     for campaigns scoped to that audience (Mailchimp `list_id`).
 *   - `status`: OPTIONAL filter. Mailchimp campaign statuses are
 *     `save` (draft), `paused`, `schedule`, `sending`, `sent`. Most
 *     workflows want one of `save` or `sent`. When omitted, the
 *     trigger fires on any newly-created campaign.
 *   - `pollingEnabled`: set to `true` by activation hook; the cron
 *     uses `config.pollingEnabled` to discover the row.
 *   - `snapshot.knownCampaignIds`: set of campaign ids the activation
 *     hook captured as the baseline. Newly-observed ids on subsequent
 *     polls fire the trigger.
 *   - `snapshot.capturedAt`: diagnostic timestamp for the baseline.
 *   - `polling.lastPolledAt`: advanced each poll tick.
 *
 * V2 polling baseline rule: the activation hook is responsible for
 * populating `snapshot`. The poll handler treats a missing snapshot
 * as a defensive skip (no events emitted) rather than treating it as
 * "fire historical events on first poll" — fail-loud at the
 * activation boundary instead.
 */
export const CampaignCreatedConfigSchema = z.object({
  audienceId: z.string().min(1).optional(),
  status: z
    .enum(["save", "paused", "schedule", "sending", "sent"])
    .optional(),
  pollingEnabled: z.boolean().default(false),
  snapshot: z
    .object({
      /**
       * Set of campaign ids known at activation time. Stored as a
       * sorted array (not a Set) so the JSONB shape is stable across
       * snapshot writes — Postgres JSONB equality compares
       * lexicographically.
       */
      knownCampaignIds: z.array(z.string().min(1)),
      capturedAt: z.string().min(1),
    })
    .optional(),
  polling: z
    .object({
      lastPolledAt: z.string().min(1),
    })
    .optional(),
});
export type CampaignCreatedConfig = z.infer<typeof CampaignCreatedConfigSchema>;
