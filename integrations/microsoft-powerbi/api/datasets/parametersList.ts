import { powerbiFetch } from "../_base";

/**
 * Wrapper for Power BI
 * `GET /v1.0/myorg/groups/{groupId}/datasets/{datasetId}/parameters`
 * (Get Parameters In Group).
 *
 * Returns parameter NAMES only. Power BI's `MashupParameter` rows also
 * carry `currentValue` — deliberately NOT surfaced: parameter values
 * routinely embed connection strings / server names, and this wrapper
 * feeds the options picker (labels must stay value-free).
 */

export interface ParametersListInput {
  accessToken: string;
  groupId: string;
  datasetId: string;
}

export interface PowerBiSemanticModelParameter {
  name: string;
}

interface ParametersListBody {
  value?: Array<{ name?: string }>;
}

export async function parametersList(
  input: ParametersListInput,
): Promise<PowerBiSemanticModelParameter[]> {
  const res = await powerbiFetch({
    accessToken: input.accessToken,
    method: "GET",
    path: `/groups/${encodeURIComponent(input.groupId)}/datasets/${encodeURIComponent(
      input.datasetId,
    )}/parameters`,
    notFoundResource: `semantic model ${input.datasetId}`,
    operation: "dataset parameters GET",
  });

  const body = (await res.json()) as ParametersListBody;
  const rows = body.value ?? [];
  const parameters: PowerBiSemanticModelParameter[] = [];
  for (const row of rows) {
    if (typeof row.name !== "string" || row.name.length === 0) continue;
    parameters.push({ name: row.name });
  }
  return parameters;
}
