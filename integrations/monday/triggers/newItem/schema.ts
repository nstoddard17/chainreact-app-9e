import { z } from "zod";

/**
 * Zod config schema for the Monday `new_item` webhook trigger —
 * Slice 3.MONDAY-7.
 *
 * User-set field: `boardId` (the board to watch). The remaining fields
 * are written by the activation hook (`_shared/activate.ts`) after
 * `create_webhook` succeeds and are optional from the builder's
 * perspective. Unknown keys are stripped by the non-strict object so the
 * post-activation merged config still parses.
 */
export const MondayNewItemConfigSchema = z.object({
  boardId: z.string().min(1),

  // Activation-written lifecycle fields.
  webhookEnabled: z.boolean().default(false),
  webhookId: z.string().optional(),
  event: z.string().optional(),
  notificationUrl: z.string().optional(),
  // Residual from the shared activate factory (always null for new_item).
  columnId: z.string().nullable().optional(),
});
export type MondayNewItemConfig = z.infer<typeof MondayNewItemConfigSchema>;
