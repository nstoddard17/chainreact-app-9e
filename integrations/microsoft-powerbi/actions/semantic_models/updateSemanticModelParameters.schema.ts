import { z } from "zod";

/**
 * Resolved-config schema for
 * `microsoft-powerbi:update_semantic_model_parameters`.
 *
 * `parameters` mirrors Power BI's `updateDetails` limit: max 100 per
 * request, names case-sensitive, all must exist on the model. The caller
 * must OWN the model (pair with Take Over Semantic Model).
 */
export const UpdateSemanticModelParametersConfigSchema = z
  .object({
    workspaceId: z.string().min(1),
    semanticModelId: z.string().min(1),
    parameters: z
      .array(
        z
          .object({
            name: z.string().min(1),
            newValue: z.string().min(1),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict();

export type UpdateSemanticModelParametersConfig = z.infer<
  typeof UpdateSemanticModelParametersConfigSchema
>;
