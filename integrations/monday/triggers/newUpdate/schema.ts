import { z } from "zod";

/**
 * Zod config schema for the Monday `new_update` webhook trigger —
 * Slice 3.MONDAY-7. User-set field: `boardId`. The rest is written by the
 * activation hook.
 */
export const MondayNewUpdateConfigSchema = z.object({
  boardId: z.string().min(1),

  webhookEnabled: z.boolean().default(false),
  webhookId: z.string().optional(),
  event: z.string().optional(),
  notificationUrl: z.string().optional(),
  columnId: z.string().nullable().optional(),
});
export type MondayNewUpdateConfig = z.infer<typeof MondayNewUpdateConfigSchema>;
