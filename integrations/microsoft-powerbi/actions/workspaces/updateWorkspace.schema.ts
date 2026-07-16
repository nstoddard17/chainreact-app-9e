import { z } from "zod";

/**
 * Resolved-config schema for `microsoft-powerbi:update_workspace`.
 *
 * Partial update — only provided fields are sent to the provider; the
 * refinement requires at least one so an empty PATCH never fires.
 * The exposed field set is limited to `name` + `description` (see the
 * `groupUpdate` wrapper NOTE — the full Update Group body contract is
 * documented only via the operation index).
 */
export const UpdateWorkspaceConfigSchema = z
  .object({
    workspaceId: z.string().min(1),
    name: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
  })
  .strict()
  .refine(
    (c) => c.name !== undefined || c.description !== undefined,
    "Provide at least one field to update (name or description).",
  );

export type UpdateWorkspaceConfig = z.infer<typeof UpdateWorkspaceConfigSchema>;
