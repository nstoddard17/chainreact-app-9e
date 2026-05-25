import { z } from "zod";

/**
 * Zod schema for the Mailchimp `new_audience` polling trigger
 * config — Mailchimp 2.1 Commit 3.
 *
 * Detects account-wide audience (list) creation. Mailchimp has no
 * webhook for list creation; polling `GET /lists` is the only path.
 *
 * **No required config.** The trigger watches all audiences in the
 * account; there's nothing meaningful to scope by. Mailchimp accounts
 * typically have a handful of audiences so the snapshot stays small.
 *
 * Snapshot stores the sorted set of known list ids. New ids on
 * subsequent polls fire the trigger.
 */
export const NewAudienceConfigSchema = z.object({
  pollingEnabled: z.boolean().default(false),
  snapshot: z
    .object({
      /**
       * Set of Mailchimp list ids known at the most-recent poll time.
       * Sorted for stable JSONB equality.
       */
      knownListIds: z.array(z.string().min(1)),
      capturedAt: z.string().min(1),
    })
    .optional(),
  polling: z
    .object({
      lastPolledAt: z.string().min(1),
    })
    .optional(),
});

export type NewAudienceConfig = z.infer<typeof NewAudienceConfigSchema>;
