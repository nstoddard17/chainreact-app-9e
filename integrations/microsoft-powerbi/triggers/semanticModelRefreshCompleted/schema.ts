import { z } from "zod";

/**
 * Config schema for the Power BI `semantic_model_refresh_completed`
 * polling trigger.
 *
 * `snapshot.seenRequestIds` holds the refresh request ids that have
 * ALREADY been observed in the `Completed` state — seeded at activation
 * from the model's current refresh history so pre-existing refreshes are
 * never replayed. A refresh that is still in progress at activation time
 * is deliberately NOT seeded: it fires once it reaches `Completed`.
 */
export const PowerBiSemanticModelRefreshCompletedConfigSchema = z.object({
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

export type PowerBiSemanticModelRefreshCompletedConfig = z.infer<
  typeof PowerBiSemanticModelRefreshCompletedConfigSchema
>;
