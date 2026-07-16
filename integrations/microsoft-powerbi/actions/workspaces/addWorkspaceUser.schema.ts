import { z } from "zod";

/**
 * Resolved-config schema for `microsoft-powerbi:add_workspace_user`.
 *
 * Q11: `accessRight` and `principalType` are REQUIRED with no silent
 * default — access grants are behavior-switching and consequential.
 * The provider's `None` values are deliberately not offered (Add never
 * grants "no role").
 *
 * Principal addressing follows the documented body per principal kind:
 *   - `User`        → `principalEmail` (email/UPN) required.
 *   - `Group`/`App` → `principalIdentifier` (Entra object id) required.
 * The handler sends ONLY the field the chosen principal type uses.
 */
export const AddWorkspaceUserConfigSchema = z
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

export type AddWorkspaceUserConfig = z.infer<
  typeof AddWorkspaceUserConfigSchema
>;
