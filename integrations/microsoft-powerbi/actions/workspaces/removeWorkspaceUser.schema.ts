import { z } from "zod";

/**
 * Resolved-config schema for `microsoft-powerbi:remove_workspace_user`.
 *
 * `principalIdentifier` is the email/UPN or Entra object id EXACTLY as
 * Get Group Users returns it — the same string the provider's DELETE
 * path segment accepts (the wrapper URL-encodes it).
 */
export const RemoveWorkspaceUserConfigSchema = z
  .object({
    workspaceId: z.string().min(1),
    principalIdentifier: z.string().min(1),
  })
  .strict();

export type RemoveWorkspaceUserConfig = z.infer<
  typeof RemoveWorkspaceUserConfigSchema
>;
