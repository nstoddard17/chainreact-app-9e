import { powerbiFetch } from "../_base";

/**
 * Wrapper for Power BI `GET /v1.0/myorg/groups/{groupId}/dataflows`
 * (Get Dataflows).
 *
 * Lists the Gen1 dataflows in a workspace — backs the
 * `microsoft-powerbi:dataflows` options picker (value = objectId,
 * label = name). Dataflow endpoints are group-scoped only (no
 * My-workspace variant), matching the provider-wide workspace-scoped
 * design. No documented server-side paging; fixed-key mapping only.
 */

export interface DataflowsListInput {
  accessToken: string;
  groupId: string;
}

export interface PowerBiDataflow {
  objectId: string;
  name: string;
  description: string | null;
}

interface DataflowsListBody {
  value?: Array<{
    objectId?: string;
    name?: string;
    description?: string;
  }>;
}

export async function dataflowsList(
  input: DataflowsListInput,
): Promise<PowerBiDataflow[]> {
  const res = await powerbiFetch({
    accessToken: input.accessToken,
    method: "GET",
    path: `/groups/${encodeURIComponent(input.groupId)}/dataflows`,
    notFoundResource: `workspace ${input.groupId}`,
    operation: "dataflows GET",
  });

  const body = (await res.json()) as DataflowsListBody;
  const dataflows: PowerBiDataflow[] = [];
  for (const row of body.value ?? []) {
    if (typeof row.objectId !== "string" || typeof row.name !== "string")
      continue;
    dataflows.push({
      objectId: row.objectId,
      name: row.name,
      description:
        typeof row.description === "string" ? row.description : null,
    });
  }
  return dataflows;
}
