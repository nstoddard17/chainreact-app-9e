import { z } from "zod";

/**
 * Resolved-config schema for `microsoft-powerbi:cancel_semantic_model_refresh`.
 *
 * `refreshRequestId` is the `x-ms-request-id` returned by
 * `refresh_semantic_model` — typically wired as a variable from that
 * node's output. Cancellation only works for ENHANCED (API-started)
 * refreshes; standard/scheduled refreshes reject the DELETE provider-side.
 */
export const CancelSemanticModelRefreshConfigSchema = z
  .object({
    workspaceId: z.string().min(1),
    semanticModelId: z.string().min(1),
    refreshRequestId: z.string().min(1),
  })
  .strict();

export type CancelSemanticModelRefreshConfig = z.infer<
  typeof CancelSemanticModelRefreshConfigSchema
>;
