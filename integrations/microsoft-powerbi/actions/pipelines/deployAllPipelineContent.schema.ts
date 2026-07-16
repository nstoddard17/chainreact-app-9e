import { z } from "zod";

/**
 * Resolved-config schema for `microsoft-powerbi:deploy_all_pipeline_content`.
 *
 * Q11: `allowCreateArtifact` and `allowOverwriteArtifact` are REQUIRED
 * booleans with no silent default — they switch whether the deploy may
 * create / overwrite target-stage content. `allowPurgeData` (advanced,
 * optional) authorizes Power BI to wipe target data on schema mismatch;
 * it is never defaulted.
 *
 * `sourceStageOrder` arrives as the stage-picker's string value (the
 * numeric stage order: Development=0, Test=1, Production=2) or as a
 * number from a variable — the union rejects empty/non-numeric strings
 * (a blank must never silently become stage 0) and normalizes to number.
 */
export const StageOrderSchema = z
  .union([
    z.number().int().min(0),
    z.string().regex(/^\d+$/, "Stage order must be a non-negative integer"),
  ])
  .transform((v) => (typeof v === "number" ? v : Number(v)));

export const DeployAllPipelineContentConfigSchema = z
  .object({
    pipelineId: z.string().min(1),
    sourceStageOrder: StageOrderSchema,
    allowCreateArtifact: z.boolean(),
    allowOverwriteArtifact: z.boolean(),
    isBackwardDeployment: z.boolean().optional(),
    allowPurgeData: z.boolean().optional(),
  })
  .strict();

export type DeployAllPipelineContentConfig = z.infer<
  typeof DeployAllPipelineContentConfigSchema
>;
