import { z } from "zod";

/**
 * Resolved-config schema for `microsoft-powerbi:create_workspace`.
 *
 * Single V2-shaped input — the wrapper synthesizes the documented
 * `{name}` body and always sends `workspaceV2=true` (the only supported
 * value).
 */
export const CreateWorkspaceConfigSchema = z
  .object({
    name: z.string().min(1),
  })
  .strict();

export type CreateWorkspaceConfig = z.infer<typeof CreateWorkspaceConfigSchema>;
