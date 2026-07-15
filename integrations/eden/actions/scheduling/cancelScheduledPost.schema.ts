import { z } from "zod";

/**
 * `eden:cancel_scheduled_post` — cancel a scheduled post or delete a draft by id, removing it
 * from the publish queue. Permanent. Cannot cancel a post already publishing/posted (conflict).
 */
export const CancelScheduledPostConfigSchema = z
  .object({
    postId: z.string().min(1),
    scheduleId: z.string().optional(),
  })
  .strict();
export type CancelScheduledPostConfig = z.infer<typeof CancelScheduledPostConfigSchema>;
