import { z } from "zod";

/**
 * Config schema for the Power BI `semantic_model_refresh_canceled`
 * polling trigger. `snapshot.seenRequestIds` tracks the request ids
 * already observed in the provider's `Cancelled` state (British spelling
 * on the wire; the event type uses the product's American spelling —
 * see the trigger meta).
 */
export const PowerBiSemanticModelRefreshCanceledConfigSchema = z.object({
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

export type PowerBiSemanticModelRefreshCanceledConfig = z.infer<
  typeof PowerBiSemanticModelRefreshCanceledConfigSchema
>;
