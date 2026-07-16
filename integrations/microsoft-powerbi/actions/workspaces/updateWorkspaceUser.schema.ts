import { z } from "zod";

/**
 * Resolved-config schema for `microsoft-powerbi:update_workspace_user`.
 *
 * Same shape + refinements as `add_workspace_user` — the provider's
 * Update Group User (`PUT /groups/{id}/users`) takes the same body as
 * Add; `accessRight` carries the NEW role. Q11: both `accessRight` and
 * `principalType` are REQUIRED with no silent default.
 */
export const UpdateWorkspaceUserConfigSchema = z
  .object({
    workspaceId: z.string().min(1),
    principalType: z.enum(["User", "Group", "App"]),
    principalEmail: z.string().min(1).optional(),
    principalIdentifier: z.string().min(1).optional(),
    accessRight: z.enum(["Admin", "Member", "Contributor", "Viewer"]),
  })
  .strict()
  .superRefine((c, ctx) => {
    if (c.principalType === "User" && c.principalEmail === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["principalEmail"],
        message: "principalEmail is required when principalType is 'User'.",
      });
    }
    if (c.principalType !== "User" && c.principalIdentifier === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["principalIdentifier"],
        message:
          "principalIdentifier is required when principalType is 'Group' or 'App'.",
      });
    }
  });

export type UpdateWorkspaceUserConfig = z.infer<
  typeof UpdateWorkspaceUserConfigSchema
>;
