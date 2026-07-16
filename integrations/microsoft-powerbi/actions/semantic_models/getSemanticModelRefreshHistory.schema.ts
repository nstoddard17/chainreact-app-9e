import { z } from "zod";

/**
 * Resolved-config schema for
 * `microsoft-powerbi:get_semantic_model_refresh_history`.
 *
 * `top` is a harmless bounding param — optional with a documented wrapper
 * default of 20 (Power BI itself retains at most 60 entries / 7 days).
 */
export const GetSemanticModelRefreshHistoryConfigSchema = z
  .object({
    workspaceId: z.string().min(1),
    semanticModelId: z.string().min(1),
    top: z.number().int().min(1).max(100).optional(),
  })
  .strict();

export type GetSemanticModelRefreshHistoryConfig = z.infer<
  typeof GetSemanticModelRefreshHistoryConfigSchema
>;
