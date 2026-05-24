import { z } from "zod";

/**
 * Zod config schema for the Monday `column_changed` webhook trigger —
 * Slice 3.MONDAY-7.
 *
 * User-set fields: `boardId` (required) and an OPTIONAL `columnId`
 * filter. When `columnId` is set, the activation hook subscribes to
 * Monday's `change_specific_column_value` event (config-filtered) instead
 * of the board-wide `change_column_value`. The remaining fields are
 * written by activation.
 */
export const MondayColumnChangedConfigSchema = z.object({
  boardId: z.string().min(1),
  columnId: z.string().optional(),

  // Activation-written lifecycle fields.
  webhookEnabled: z.boolean().default(false),
  webhookId: z.string().optional(),
  event: z.string().optional(),
  notificationUrl: z.string().optional(),
});
export type MondayColumnChangedConfig = z.infer<
  typeof MondayColumnChangedConfigSchema
>;
