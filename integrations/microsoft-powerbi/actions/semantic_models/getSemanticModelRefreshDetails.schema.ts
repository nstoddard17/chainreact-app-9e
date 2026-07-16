import { z } from "zod";

/**
 * Resolved-config schema for
 * `microsoft-powerbi:get_semantic_model_refresh_details`.
 *
 * `refreshRequestId` is the `x-ms-request-id` returned by
 * `refresh_semantic_model` — enhanced (API-started) refreshes only.
 */
export const GetSemanticModelRefreshDetailsConfigSchema = z
  .object({
    workspaceId: z.string().min(1),
    semanticModelId: z.string().min(1),
    refreshRequestId: z.string().min(1),
  })
  .strict();

export type GetSemanticModelRefreshDetailsConfig = z.infer<
  typeof GetSemanticModelRefreshDetailsConfigSchema
>;
