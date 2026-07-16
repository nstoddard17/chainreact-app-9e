import { powerbiFetch } from "../_base";

/**
 * Wrapper for Power BI
 * `POST /v1.0/myorg/pipelines/{pipelineId}/deployAll` (Deploy All).
 *
 * Deploys ALL supported content from the source stage to the next stage
 * (previous stage when `isBackwardDeployment`). Requires the dedicated
 * `Pipeline.Deploy` scope and at-least-contributor on both workspaces;
 * Power BI caps a request at 300 deployed items.
 *
 * `DeploymentOptions` semantics (each must be true when the deployment
 * needs it, or the deploy fails provider-side):
 *   - `allowCreateArtifact`    — create items missing from the target.
 *   - `allowOverwriteArtifact` — overwrite items already in the target.
 *   - `allowPurgeData`         — purge target data on schema mismatch
 *     (wipes target stage data — HIGH risk, sent only when set).
 *
 * Response is **202 Accepted** with a `PipelineOperation` body — the
 * deployment continues async; callers poll Get Pipeline Operation with
 * the returned operation id.
 */

export interface PipelineDeployOptionsInput {
  allowCreateArtifact: boolean;
  allowOverwriteArtifact: boolean;
  allowPurgeData?: boolean;
}

export interface PipelineDeployAllInput {
  accessToken: string;
  pipelineId: string;
  sourceStageOrder: number;
  isBackwardDeployment?: boolean;
  options: PipelineDeployOptionsInput;
}

export interface PipelineDeployResult {
  operationId: string;
  status: string | null;
}

interface PipelineOperationBody {
  id?: string;
  status?: string;
}

function buildDeployOptions(
  options: PipelineDeployOptionsInput,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    allowCreateArtifact: options.allowCreateArtifact,
    allowOverwriteArtifact: options.allowOverwriteArtifact,
  };
  if (options.allowPurgeData !== undefined)
    body.allowPurgeData = options.allowPurgeData;
  return body;
}

/** Shared 202 PipelineOperation parsing for deployAll + selective deploy. */
export async function parsePipelineOperationResponse(
  res: Response,
  operation: string,
): Promise<PipelineDeployResult> {
  const body = (await res.json()) as PipelineOperationBody;
  if (typeof body.id !== "string" || body.id.length === 0) {
    throw new Error(`Power BI ${operation} returned no operation id`);
  }
  return {
    operationId: body.id,
    status: typeof body.status === "string" ? body.status : null,
  };
}

export { buildDeployOptions };

export async function pipelineDeployAll(
  input: PipelineDeployAllInput,
): Promise<PipelineDeployResult> {
  const body: Record<string, unknown> = {
    sourceStageOrder: input.sourceStageOrder,
    options: buildDeployOptions(input.options),
  };
  if (input.isBackwardDeployment !== undefined)
    body.isBackwardDeployment = input.isBackwardDeployment;

  const res = await powerbiFetch({
    accessToken: input.accessToken,
    method: "POST",
    path: `/pipelines/${encodeURIComponent(input.pipelineId)}/deployAll`,
    body,
    notFoundResource: `pipeline ${input.pipelineId}`,
    operation: "pipeline deployAll POST",
  });

  return parsePipelineOperationResponse(res, "pipeline deployAll POST");
}
