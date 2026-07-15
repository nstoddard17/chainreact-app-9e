import { z } from "zod";

/** `eden:list_highlights` — list the account's saved highlights. */
export const ListHighlightsConfigSchema = z
  .object({
    limit: z.number().int().positive().max(100).optional(),
    offset: z.number().int().min(0).optional(),
    orderBy: z.string().optional(),
  })
  .strict();
export type ListHighlightsConfig = z.infer<typeof ListHighlightsConfigSchema>;
