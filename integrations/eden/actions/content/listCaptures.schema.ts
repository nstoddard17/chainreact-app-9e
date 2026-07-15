import { z } from "zod";

/** `eden:list_captures` — list the workspace's web captures. */
export const ListCapturesConfigSchema = z
  .object({
    workspaceId: z.string().optional(),
    status: z.string().optional(),
    limit: z.number().int().positive().max(100).optional(),
    offset: z.number().int().min(0).optional(),
  })
  .strict();
export type ListCapturesConfig = z.infer<typeof ListCapturesConfigSchema>;
