import { z } from "zod";

/** `eden:resolve_creator` — resolve a query/handle to one or more creators. */
export const ResolveCreatorConfigSchema = z
  .object({
    query: z.string().min(1),
    platform: z.string().optional(),
    limit: z.number().int().positive().max(25).optional(),
  })
  .strict();
export type ResolveCreatorConfig = z.infer<typeof ResolveCreatorConfigSchema>;
