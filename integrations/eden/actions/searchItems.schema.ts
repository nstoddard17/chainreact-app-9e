import { z } from "zod";

/** `eden:search_items` — text-search workspace items (notes, saved links/posts, boards). */
export const SearchItemsConfigSchema = z
  .object({
    workspaceId: z.string().optional(),
    query: z.string().min(1),
    type: z.string().optional(),
    limit: z.number().int().positive().max(100).optional(),
    cursor: z.string().optional(),
  })
  .strict();
export type SearchItemsConfig = z.infer<typeof SearchItemsConfigSchema>;
