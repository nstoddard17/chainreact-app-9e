import { z } from "zod";

/**
 * Resolved-config schema for `microsoft-powerbi:rebind_report`.
 *
 * Q11: `semanticModelId` (wire `datasetId`) is REQUIRED — rebinding is
 * behavior-switching for every consumer of the report; there is no
 * sensible default. Power BI reports only (the endpoint rejects
 * paginated reports).
 */
export const RebindReportConfigSchema = z
  .object({
    workspaceId: z.string().min(1),
    reportId: z.string().min(1),
    semanticModelId: z.string().min(1),
  })
  .strict();

export type RebindReportConfig = z.infer<typeof RebindReportConfigSchema>;
