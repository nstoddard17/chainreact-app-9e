import { z } from "zod";

/**
 * Resolved-config schema for `microsoft-powerbi:take_over_semantic_model`.
 * The endpoint takes no body — the config only addresses the model.
 */
export const TakeOverSemanticModelConfigSchema = z
  .object({
    workspaceId: z.string().min(1),
    semanticModelId: z.string().min(1),
  })
  .strict();

export type TakeOverSemanticModelConfig = z.infer<
  typeof TakeOverSemanticModelConfigSchema
>;
