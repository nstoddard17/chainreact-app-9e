import { z } from "zod";

/**
 * Resolved-config schema for
 * `microsoft-powerbi:get_capacity_assignment_status`.
 */
export const GetCapacityAssignmentStatusConfigSchema = z
  .object({
    workspaceId: z.string().min(1),
  })
  .strict();

export type GetCapacityAssignmentStatusConfig = z.infer<
  typeof GetCapacityAssignmentStatusConfigSchema
>;
