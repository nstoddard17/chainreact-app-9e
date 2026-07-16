import { powerbiFetch } from "../_base";
import {
  buildDeployOptions,
  parsePipelineOperationResponse,
  type PipelineDeployOptionsInput,
  type PipelineDeployResult,
} from "./pipelineDeployAll";

/**
 * Wrapper for Power BI
 * `POST /v1.0/myorg/pipelines/{pipelineId}/deploy` (Selective Deploy).
 *
 * Deploys only the named items from the source stage. The body carries
 * per-type arrays `datasets` / `reports` / `dashboards` / `dataflows`
 * of `{sourceId}` items — an array is included only when the caller
 * selected ids of that type (the action schema enforces ≥1 id overall;
 * Power BI caps a request at 300 items). Same `Pipeline.Deploy` scope,
 * `DeploymentOptions` semantics, and async **202 → PipelineOperation**
 * contract as deployAll.
 */

export interface PipelineDeploySelectiveInput {
  accessToken: string;
  pipelineId: string;
  sourceStageOrder: number;
  /** V2 surface "semantic models" → Power BI wire array `datasets`. */
  semanticModelIds?: readonly string[];
  reportIds?: readonly string[];
  dashboardIds?: readonly string[];
  dataflowIds?: readonly string[];
  isBackwardDeployment?: boolean;
  options: PipelineDeployOptionsInput;
}

function toSourceIdItems(
  ids: readonly string[] | undefined,
): Array<{ sourceId: string }> | undefined {
  if (!ids || ids.length === 0) return undefined;
  return ids.map((sourceId) => ({ sourceId }));
}

export async function pipelineDeploySelective(
  input: PipelineDeploySelectiveInput,
): Promise<PipelineDeployResult> {
  const body: Record<string, unknown> = {
    sourceStageOrder: input.sourceStageOrder,
    options: buildDeployOptions(input.options),
  };
  const datasets = toSourceIdItems(input.semanticModelIds);
  const reports = toSourceIdItems(input.reportIds);
  const dashboards = toSourceIdItems(input.dashboardIds);
  const dataflows = toSourceIdItems(input.dataflowIds);
  if (datasets) body.datasets = datasets;
  if (reports) body.reports = reports;
  if (dashboards) body.dashboards = dashboards;
  if (dataflows) body.dataflows = dataflows;
  if (input.isBackwardDeployment !== undefined)
    body.isBackwardDeployment = input.isBackwardDeployment;

  const res = await powerbiFetch({
    accessToken: input.accessToken,
    method: "POST",
    path: `/pipelines/${encodeURIComponent(input.pipelineId)}/deploy`,
    body,
    notFoundResource: `pipeline ${input.pipelineId}`,
    operation: "pipeline selective deploy POST",
  });

  return parsePipelineOperationResponse(res, "pipeline selective deploy POST");
}
