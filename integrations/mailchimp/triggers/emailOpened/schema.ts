import { z } from "zod";

/**
 * Zod schema for the Mailchimp `email_opened` polling trigger config —
 * Slice 14 Commit 5.
 *
 * Validation rules:
 *   - `campaignId`: OPTIONAL. When set, the trigger watches ONE
 *     specific campaign. When omitted, the trigger watches the most
 *     recent 10 sent campaigns (Mailchimp default ordering).
 *   - `snapshot.campaigns`: per-campaign `totalOpens` snapshot.
 *     `snapshot.knownOpens`: set of `${campaignId}:${email}` keys
 *     that have already fired. Two-tier snapshot:
 *       1. `campaigns[id].totalOpens` lets the poll skip detail
 *          fetches when the report total hasn't changed.
 *       2. `knownOpens` is the per-event dedup ledger — local to the
 *          row, fast-path before hitting the global
 *          `webhook_event_dedup` table.
 *   - The poll handler also writes to `webhook_event_dedup`. Both
 *     layers cooperate: local snapshot reduces redundant work,
 *     global dedup handles the cross-tick case where the snapshot
 *     update raced with a crash.
 */
export const EmailOpenedConfigSchema = z.object({
  campaignId: z.string().min(1).optional(),
  pollingEnabled: z.boolean().default(false),
  snapshot: z
    .object({
      campaigns: z.record(
        z.string().min(1),
        z.object({ totalOpens: z.number().int().nonnegative() }),
      ),
      knownOpens: z.array(z.string().min(1)).default([]),
      capturedAt: z.string().min(1),
    })
    .optional(),
  polling: z
    .object({
      lastPolledAt: z.string().min(1),
    })
    .optional(),
});
export type EmailOpenedConfig = z.infer<typeof EmailOpenedConfigSchema>;
