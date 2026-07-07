import { z } from "zod";

/**
 * Zod config schema for the Asana `task_assigned` webhook trigger —
 * ASANA-2.
 *
 * Adds one optional user-set field over the shared ASANA-1 shape:
 * `assigneeId` — when set, only assignments TO that user fire the
 * workflow (evaluated in filter.ts against the post-fetched authoritative
 * assignee). Builder-cleared optional fields arrive as "" — treated as
 * "no filter".
 */
export const AsanaTaskAssignedConfigSchema = z.object({
  workspaceId: z.string().optional(),
  projectId: z.string().min(1),
  assigneeId: z.string().optional(),

  // Activation-written lifecycle fields.
  webhookEnabled: z.boolean().default(false),
  webhookId: z.string().optional(),
  hookSecretEncrypted: z.string().optional(),
  notificationUrl: z.string().optional(),
  handshakePending: z.boolean().optional(),
});
export type AsanaTaskAssignedConfig = z.infer<
  typeof AsanaTaskAssignedConfigSchema
>;
