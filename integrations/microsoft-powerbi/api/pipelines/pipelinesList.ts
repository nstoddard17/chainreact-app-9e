import { powerbiFetch } from "../_base";

/**
 * Wrapper for Power BI `GET /v1.0/myorg/pipelines` (Get Pipelines).
 *
 * Lists the deployment pipelines the connected user can access. Pipeline
 * endpoints are NOT group-scoped — they live directly under `/myorg`.
 * The endpoint documents no server-side paging params; the full set is
 * returned and mapped onto a fixed key set (never spread).
 */

export interface PipelinesListInput {
  accessToken: string;
}

export interface PowerBiPipeline {
  id: string;
  displayName: string;
  description: string | null;
}

interface PipelinesListBody {
  value?: Array<{
    id?: string;
    displayName?: string;
    description?: string;
  }>;
}

export async function pipelinesList(
  input: PipelinesListInput,
): Promise<PowerBiPipeline[]> {
  const res = await powerbiFetch({
    accessToken: input.accessToken,
    method: "GET",
    path: "/pipelines",
    operation: "pipelines GET",
  });

  const body = (await res.json()) as PipelinesListBody;
  const rows = body.value ?? [];
  const pipelines: PowerBiPipeline[] = [];
  for (const row of rows) {
    if (typeof row.id !== "string" || typeof row.displayName !== "string")
      continue;
    pipelines.push({
      id: row.id,
      displayName: row.displayName,
      description:
        typeof row.description === "string" ? row.description : null,
    });
  }
  return pipelines;
}
