import { z } from "zod";

/**
 * Config schema for the Power BI `semantic_model_refresh_failed` polling
 * trigger. Same shape as the completed variant; `snapshot.seenRequestIds`
 * tracks the request ids already observed in the `Failed` state.
 */
export const PowerBiSemanticModelRefreshFailedConfigSchema = z.object({
  workspaceId: z.string().min(1),
  semanticModelId: z.string().min(1),

  pollingEnabled: z.boolean().default(false),
  snapshot: z
    .object({
      seenRequestIds: z.array(z.string()),
      updatedAt: z.string().min(1),
    })
    .optional(),
  polling: z.object({ lastPolledAt: z.string().min(1) }).optional(),
});

export type PowerBiSemanticModelRefreshFailedConfig = z.infer<
  typeof PowerBiSemanticModelRefreshFailedConfigSchema
>;
