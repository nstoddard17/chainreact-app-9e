import { z } from "zod";

/**
 * Zod config schema for the Asana `task_updated_in_project` webhook
 * trigger — Slice 5.ASANA-1.
 *
 * Identical shape to `newTaskInProject/schema.ts` (user-set workspaceId /
 * projectId + activation-written lifecycle fields).
 */
export const AsanaTaskUpdatedInProjectConfigSchema = z.object({
  workspaceId: z.string().optional(),
  projectId: z.string().min(1),

  // Activation-written lifecycle fields.
  webhookEnabled: z.boolean().default(false),
  webhookId: z.string().optional(),
  hookSecretEncrypted: z.string().optional(),
  notificationUrl: z.string().optional(),
  handshakePending: z.boolean().optional(),
});
export type AsanaTaskUpdatedInProjectConfig = z.infer<
  typeof AsanaTaskUpdatedInProjectConfigSchema
>;
