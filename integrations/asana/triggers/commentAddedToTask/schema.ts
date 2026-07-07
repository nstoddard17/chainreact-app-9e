import { z } from "zod";

/**
 * Zod config schema for the Asana `comment_added_to_task` webhook
 * trigger — ASANA-2.
 *
 * Same shape as the ASANA-1 project-webhook triggers (user-set
 * workspaceId / projectId + activation-written lifecycle fields). The
 * trigger differs in its server-side filter (story+added,
 * resource_subtype:"comment_added") and the receive-time story
 * post-fetch (scope stories:read).
 */
export const AsanaCommentAddedToTaskConfigSchema = z.object({
  workspaceId: z.string().optional(),
  projectId: z.string().min(1),

  // Activation-written lifecycle fields.
  webhookEnabled: z.boolean().default(false),
  webhookId: z.string().optional(),
  hookSecretEncrypted: z.string().optional(),
  notificationUrl: z.string().optional(),
  handshakePending: z.boolean().optional(),
});
export type AsanaCommentAddedToTaskConfig = z.infer<
  typeof AsanaCommentAddedToTaskConfigSchema
>;
