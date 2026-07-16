import { powerbiFetch } from "../_base";

/**
 * Wrapper for Power BI `GET /v1.0/myorg/groups/{groupId}/datasets`
 * (Get Datasets In Group).
 *
 * Lists the semantic models (datasets) in a workspace. The endpoint has
 * no server-side paging params — Power BI returns the full set; list
 * sizes are workspace-bounded and small in practice. Fixed-key mapping
 * only (never spread the raw rows).
 */

export interface DatasetsListInput {
  accessToken: string;
  groupId: string;
}

export interface PowerBiDataset {
  id: string;
  name: string;
  isRefreshable: boolean;
  configuredBy: string | null;
}

interface DatasetsListBody {
  value?: Array<{
    id?: string;
    name?: string;
    isRefreshable?: boolean;
    configuredBy?: string;
  }>;
}

export async function datasetsList(
  input: DatasetsListInput,
): Promise<PowerBiDataset[]> {
  const res = await powerbiFetch({
    accessToken: input.accessToken,
    method: "GET",
    path: `/groups/${encodeURIComponent(input.groupId)}/datasets`,
    notFoundResource: `workspace ${input.groupId}`,
    operation: "datasets GET",
  });

  const body = (await res.json()) as DatasetsListBody;
  const rows = body.value ?? [];
  const datasets: PowerBiDataset[] = [];
  for (const row of rows) {
    if (typeof row.id !== "string" || typeof row.name !== "string") continue;
    datasets.push({
      id: row.id,
      name: row.name,
      isRefreshable: row.isRefreshable === true,
      configuredBy: typeof row.configuredBy === "string" ? row.configuredBy : null,
    });
  }
  return datasets;
}
