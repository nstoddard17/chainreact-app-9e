import { z } from "zod";

/**
 * Resolved-config schema for `microsoft-powerbi:refresh_dataflow`.
 *
 * Q11: `notifyOption` is REQUIRED with no silent default — it is
 * recipient-visible (owner gets mail on failure). `MailOnCompletion`
 * is NOT supported for dataflows (dataset refreshes only), so the enum
 * pins the two valid values.
 */
export const RefreshDataflowConfigSchema = z
  .object({
    workspaceId: z.string().min(1),
    dataflowId: z.string().min(1),
    notifyOption: z.enum(["MailOnFailure", "NoNotification"]),
  })
  .strict();

export type RefreshDataflowConfig = z.infer<typeof RefreshDataflowConfigSchema>;
