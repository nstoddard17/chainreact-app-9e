import { z } from "zod";

/** `eden:following_overview` — who the connected account follows (counts + capped list). */
export const FollowingOverviewConfigSchema = z
  .object({
    workspaceId: z.string().optional(),
    platform: z.string().optional(),
    limit: z.number().int().positive().max(100).optional(),
  })
  .strict();
export type FollowingOverviewConfig = z.infer<typeof FollowingOverviewConfigSchema>;
