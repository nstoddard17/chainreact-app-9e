import { z } from "zod";

/** `eden:list_scheduled_posts` — one page of queued/sent posts. */
export const ListScheduledPostsConfigSchema = z
  .object({
    workspaceId: z.string().optional(),
    scheduleId: z.string().optional(),
    status: z.string().optional(),
    limit: z.number().int().positive().max(100).optional(),
  })
  .strict();
export type ListScheduledPostsConfig = z.infer<typeof ListScheduledPostsConfigSchema>;
