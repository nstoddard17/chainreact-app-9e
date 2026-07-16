import { z } from "zod";

/**
 * Resolved-config schema for `microsoft-powerbi:refresh_semantic_model`.
 *
 * Q11: `notifyOption` is REQUIRED with no silent default — it is
 * recipient-visible (owner gets mail on failure/completion) and
 * behavior-switching.
 *
 * The four optional enhanced-refresh fields trigger Power BI's enhanced
 * refresh when ANY is set — supported only on Premium / PPU / Embedded
 * capacity (shared capacity rejects them provider-side; the error
 * propagates to the engine). They are `advanced: true` in the meta.
 */
export const RefreshSemanticModelConfigSchema = z
  .object({
    workspaceId: z.string().min(1),
    semanticModelId: z.string().min(1),
    notifyOption: z.enum([
      "MailOnFailure",
      "MailOnCompletion",
      "NoNotification",
    ]),
    refreshType: z
      .enum([
        "automatic",
        "full",
        "clearValues",
        "calculate",
        "dataOnly",
        "defragment",
      ])
      .optional(),
    commitMode: z.enum(["transactional", "partialBatch"]).optional(),
    maxParallelism: z.number().int().min(1).max(30).optional(),
    retryCount: z.number().int().min(0).max(5).optional(),
    applyRefreshPolicy: z.boolean().optional(),
  })
  .strict();

export type RefreshSemanticModelConfig = z.infer<
  typeof RefreshSemanticModelConfigSchema
>;
