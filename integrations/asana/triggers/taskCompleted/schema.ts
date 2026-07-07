import { z } from "zod";

/**
 * Zod config schema for the Asana `task_completed` webhook trigger —
 * ASANA-2.
 *
 * Same shape as `taskUpdatedInProject/schema.ts` (user-set workspaceId /
 * projectId + activation-written lifecycle fields) — the trigger differs
 * only in its server-side filter (task+changed, fields:["completed"])
 * and the receive-time completed===true post-fetch gate.
 */
export const AsanaTaskCompletedConfigSchema = z.object({
  workspaceId: z.string().optional(),
  projectId: z.string().min(1),

  // Activation-written lifecycle fields.
  webhookEnabled: z.boolean().default(false),
  webhookId: z.string().optional(),
  hookSecretEncrypted: z.string().optional(),
  notificationUrl: z.string().optional(),
  handshakePending: z.boolean().optional(),
});
export type AsanaTaskCompletedConfig = z.infer<
  typeof AsanaTaskCompletedConfigSchema
>;
