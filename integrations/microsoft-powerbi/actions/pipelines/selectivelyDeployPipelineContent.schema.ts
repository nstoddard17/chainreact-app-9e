import { z } from "zod";
import { StageOrderSchema } from "./deployAllPipelineContent.schema";

/**
 * Resolved-config schema for
 * `microsoft-powerbi:selectively_deploy_pipeline_content`.
 *
 * Q11: `allowCreateArtifact` / `allowOverwriteArtifact` REQUIRED, no
 * silent default; `allowPurgeData` optional-advanced, never defaulted.
 *
 * At least one id across the four per-type arrays must be provided —
 * an empty selective deploy is a config error, not a provider no-op.
 * Power BI caps a deploy request at 300 items (refined here so the
 * failure is a parse error, not a provider rejection mid-run).
 */
const IdArraySchema = z.array(z.string().min(1)).max(300);

export const SelectivelyDeployPipelineContentConfigSchema = z
  .object({
    pipelineId: z.string().min(1),
    sourceStageOrder: StageOrderSchema,
    semanticModelIds: IdArraySchema.optional(),
    reportIds: IdArraySchema.optional(),
    dashboardIds: IdArraySchema.optional(),
    dataflowIds: IdArraySchema.optional(),
    allowCreateArtifact: z.boolean(),
    allowOverwriteArtifact: z.boolean(),
    isBackwardDeployment: z.boolean().optional(),
    allowPurgeData: z.boolean().optional(),
  })
  .strict()
  .superRefine((config, ctx) => {
    const total =
      (config.semanticModelIds?.length ?? 0) +
      (config.reportIds?.length ?? 0) +
      (config.dashboardIds?.length ?? 0) +
      (config.dataflowIds?.length ?? 0);
    if (total === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Select at least one semantic model, report, dashboard, or dataflow to deploy.",
      });
    }
    if (total > 300) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Power BI caps a deployment at 300 items — reduce the selection.",
      });
    }
  });

export type SelectivelyDeployPipelineContentConfig = z.infer<
  typeof SelectivelyDeployPipelineContentConfigSchema
>;
