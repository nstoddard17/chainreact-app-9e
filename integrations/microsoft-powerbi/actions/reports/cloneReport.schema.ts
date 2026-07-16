import { z } from "zod";

/**
 * Resolved-config schema for `microsoft-powerbi:clone_report`.
 *
 * `targetWorkspaceId` / `targetSemanticModelId` are optional and sent
 * ONLY when set — omitted, the clone lands in the same workspace bound
 * to the same semantic model (the documented Clone defaults; no hidden
 * V2 defaults layered on top).
 */
export const CloneReportConfigSchema = z
  .object({
    workspaceId: z.string().min(1),
    reportId: z.string().min(1),
    newReportName: z.string().min(1).max(256),
    targetWorkspaceId: z.string().min(1).optional(),
    targetSemanticModelId: z.string().min(1).optional(),
  })
  .strict();

export type CloneReportConfig = z.infer<typeof CloneReportConfigSchema>;
