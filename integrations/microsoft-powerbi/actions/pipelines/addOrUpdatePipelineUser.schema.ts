import { z } from "zod";

/**
 * Resolved-config schema for
 * `microsoft-powerbi:add_or_update_pipeline_user`.
 *
 * Q11: `principalType` and `accessRight` are REQUIRED with no silent
 * default — they switch who is granted what.
 *
 * `accessRight` pins the EXACT documented `PipelineUserAccessRight`
 * value set — the API documents a single value, `Admin`. The enum stays
 * so any future documented values are an additive change here.
 * `principalType`'s documented enum is User | Group | App | None; `None`
 * is meaningless for a grant and is deliberately not offered.
 */
export const AddOrUpdatePipelineUserConfigSchema = z
  .object({
    pipelineId: z.string().min(1),
    principalIdentifier: z.string().min(1),
    principalType: z.enum(["User", "Group", "App"]),
    accessRight: z.enum(["Admin"]),
  })
  .strict();

export type AddOrUpdatePipelineUserConfig = z.infer<
  typeof AddOrUpdatePipelineUserConfigSchema
>;
