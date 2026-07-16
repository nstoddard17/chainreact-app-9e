import { z } from "zod";

/**
 * Zod schema for the Power BI `workspace_access_changed` polling trigger.
 *
 * Snapshot is the principal→role map serialized as a stable entry list.
 * `principal` is the email/UPN when the principal is a user and the Entra
 * object id otherwise — the identity `groupUsersList` actually returns and
 * the one the workspace-user actions accept back. Workspace roles are
 * provider-capped at 1,000 principals, so the list is bounded by design.
 */
export const PowerBiWorkspaceAccessChangedConfigSchema = z.object({
  workspaceId: z.string().min(1),

  pollingEnabled: z.boolean().default(false),
  snapshot: z
    .object({
      entries: z.array(
        z.object({
          principal: z.string().min(1),
          right: z.string().min(1),
        }),
      ),
      updatedAt: z.string().min(1),
    })
    .optional(),
  polling: z.object({ lastPolledAt: z.string().min(1) }).optional(),
});

export type PowerBiWorkspaceAccessChangedConfig = z.infer<
  typeof PowerBiWorkspaceAccessChangedConfigSchema
>;
