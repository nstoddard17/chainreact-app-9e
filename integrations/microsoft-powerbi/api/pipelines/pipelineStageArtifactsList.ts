import { powerbiFetch } from "../_base";

/**
 * Wrapper for Power BI
 * `GET /v1.0/myorg/pipelines/{pipelineId}/stages/{stageOrder}/artifacts`
 * (Get Pipeline Stage Artifacts).
 *
 * One wrapper backs all four per-type option sources
 * (`pipeline_stage_semantic_models` / `_reports` / `_dashboards` /
 * `_dataflows`) — the endpoint returns every artifact type in one body.
 *
 * NOTE: research.md verified this endpoint's existence in the ops list
 * only (path confirmed, detail page not fetched). Response mapping
 * follows the official Get-Pipeline-Stage-Artifacts contract
 * (https://learn.microsoft.com/en-us/rest/api/power-bi/pipelines/get-pipeline-stage-artifacts):
 * per-type arrays `datasets` / `reports` / `dashboards` / `dataflows`,
 * each item `{artifactId, artifactDisplayName}`. Datamarts are
 * deliberately not surfaced (no ChainReact datamart actions).
 */

export interface PipelineStageArtifactsListInput {
  accessToken: string;
  pipelineId: string;
  stageOrder: number;
}

export interface PipelineStageArtifact {
  id: string;
  name: string;
}

export interface PipelineStageArtifactsResult {
  /** Power BI wire name "datasets" — V2 surface name is semantic models. */
  semanticModels: PipelineStageArtifact[];
  reports: PipelineStageArtifact[];
  dashboards: PipelineStageArtifact[];
  dataflows: PipelineStageArtifact[];
}

interface StageArtifactRow {
  artifactId?: string;
  artifactDisplayName?: string;
}

interface PipelineStageArtifactsBody {
  datasets?: StageArtifactRow[];
  reports?: StageArtifactRow[];
  dashboards?: StageArtifactRow[];
  dataflows?: StageArtifactRow[];
}

function mapRows(rows: StageArtifactRow[] | undefined): PipelineStageArtifact[] {
  const artifacts: PipelineStageArtifact[] = [];
  for (const row of rows ?? []) {
    if (
      typeof row.artifactId !== "string" ||
      typeof row.artifactDisplayName !== "string"
    )
      continue;
    artifacts.push({ id: row.artifactId, name: row.artifactDisplayName });
  }
  return artifacts;
}

export async function pipelineStageArtifactsList(
  input: PipelineStageArtifactsListInput,
): Promise<PipelineStageArtifactsResult> {
  const res = await powerbiFetch({
    accessToken: input.accessToken,
    method: "GET",
    path: `/pipelines/${encodeURIComponent(input.pipelineId)}/stages/${encodeURIComponent(
      String(input.stageOrder),
    )}/artifacts`,
    notFoundResource: `pipeline ${input.pipelineId} stage ${input.stageOrder}`,
    operation: "pipeline stage artifacts GET",
  });

  const body = (await res.json()) as PipelineStageArtifactsBody;
  return {
    semanticModels: mapRows(body.datasets),
    reports: mapRows(body.reports),
    dashboards: mapRows(body.dashboards),
    dataflows: mapRows(body.dataflows),
  };
}
