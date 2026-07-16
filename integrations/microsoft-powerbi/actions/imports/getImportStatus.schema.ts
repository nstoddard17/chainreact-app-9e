import { z } from "zod";

/**
 * Resolved-config schema for `microsoft-powerbi:get_import_status`.
 * Pure read — the `importId` typically arrives as a variable from an
 * upstream `import_power_bi_file` step.
 */
export const GetImportStatusConfigSchema = z
  .object({
    workspaceId: z.string().min(1),
    importId: z.string().min(1),
  })
  .strict();

export type GetImportStatusConfig = z.infer<typeof GetImportStatusConfigSchema>;
