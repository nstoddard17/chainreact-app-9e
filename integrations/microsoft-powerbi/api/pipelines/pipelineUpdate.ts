import { powerbiFetch } from "../_base";

/**
 * Wrapper for Power BI `PATCH /v1.0/myorg/pipelines/{pipelineId}`
 * (Update Pipeline).
 *
 * Updates the pipeline's `displayName` and/or `description`. Only fields
 * the caller actually set are sent — the action schema enforces that at
 * least one is provided. Success body is not consumed (fixed-key outputs
 * come from the action's own echo).
 */

export interface PipelineUpdateInput {
  accessToken: string;
  pipelineId: string;
  displayName?: string;
  description?: string;
}

export async function pipelineUpdate(
  input: PipelineUpdateInput,
): Promise<void> {
  const body: Record<string, unknown> = {};
  if (input.displayName !== undefined) body.displayName = input.displayName;
  if (input.description !== undefined) body.description = input.description;

  await powerbiFetch({
    accessToken: input.accessToken,
    method: "PATCH",
    path: `/pipelines/${encodeURIComponent(input.pipelineId)}`,
    body,
    notFoundResource: `pipeline ${input.pipelineId}`,
    operation: "pipeline update PATCH",
  });
}
