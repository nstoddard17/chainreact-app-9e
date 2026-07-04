import { z } from "zod";

/**
 * Zod config schema for the Asana `new_task_in_project` webhook trigger —
 * Slice 5.ASANA-1.
 *
 * User-set fields: `workspaceId` (UI-scope cascade root for the project
 * picker) + `projectId` (the project to watch). The remaining fields are
 * written by the activation flow (`_shared/activate.ts` + the handshake
 * path in `_shared/receive.ts`) and are optional from the builder's
 * perspective. Non-strict so the post-activation merged config still
 * parses.
 */
export const AsanaNewTaskInProjectConfigSchema = z.object({
  workspaceId: z.string().optional(),
  projectId: z.string().min(1),

  // Activation-written lifecycle fields.
  webhookEnabled: z.boolean().default(false),
  webhookId: z.string().optional(),
  hookSecretEncrypted: z.string().optional(),
  notificationUrl: z.string().optional(),
  handshakePending: z.boolean().optional(),
});
export type AsanaNewTaskInProjectConfig = z.infer<
  typeof AsanaNewTaskInProjectConfigSchema
>;
