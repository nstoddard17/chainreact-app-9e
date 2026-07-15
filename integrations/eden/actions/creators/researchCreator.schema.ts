import { z } from "zod";

/** `eden:research_creator` — profile + performance (outlier/baseline) analysis for a creator. */
export const ResearchCreatorConfigSchema = z
  .object({
    query: z.string().min(1),
    platform: z.string().optional(),
    topPostLimit: z.number().int().positive().max(50).optional(),
    since: z.string().optional(),
    workspaceId: z.string().optional(),
  })
  .strict();
export type ResearchCreatorConfig = z.infer<typeof ResearchCreatorConfigSchema>;
