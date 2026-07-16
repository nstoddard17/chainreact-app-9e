import { z } from "zod";

/**
 * Resolved-config schema for
 * `microsoft-powerbi:assign_workspace_to_capacity`.
 *
 * The provider's documented empty-GUID unassign
 * (`00000000-0000-0000-0000-000000000000`) is deliberately NOT exposed —
 * rejected here (and again in the wrapper, fail-closed) so a workflow can
 * never silently strip a workspace off dedicated capacity.
 */
export const AssignWorkspaceToCapacityConfigSchema = z
  .object({
    workspaceId: z.string().min(1),
    capacityId: z
      .string()
      .min(1)
      .refine(
        (v) => v !== "00000000-0000-0000-0000-000000000000",
        "Unassigning from capacity (empty GUID) is not supported.",
      ),
  })
  .strict();

export type AssignWorkspaceToCapacityConfig = z.infer<
  typeof AssignWorkspaceToCapacityConfigSchema
>;
