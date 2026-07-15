import { z } from "zod";

/** `eden:read_scheduled_post` — read one scheduled post / draft's full detail by id. */
export const ReadScheduledPostConfigSchema = z
  .object({
    workspaceId: z.string().optional(),
    postId: z.string().min(1),
  })
  .strict();
export type ReadScheduledPostConfig = z.infer<typeof ReadScheduledPostConfigSchema>;
