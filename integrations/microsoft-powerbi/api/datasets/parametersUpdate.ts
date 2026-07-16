import { powerbiFetch } from "../_base";

/**
 * Wrapper for Power BI
 * `POST /v1.0/myorg/groups/{groupId}/datasets/{datasetId}/Default.UpdateParameters`
 * (Update Parameters In Group).
 *
 * Body: `{ updateDetails: [{name, newValue}] }` — max 100 parameters per
 * request, all must exist (names case-sensitive), the CALLER must be the
 * dataset owner (pair with Take Over). Not supported for XMLA-created/
 * modified models; `Any`/`Binary` parameter types can't be updated.
 * Success is HTTP 200 with no meaningful body.
 */

export interface ParameterUpdate {
  name: string;
  newValue: string;
}

export interface ParametersUpdateInput {
  accessToken: string;
  groupId: string;
  datasetId: string;
  updates: ParameterUpdate[];
}

export async function parametersUpdate(
  input: ParametersUpdateInput,
): Promise<void> {
  await powerbiFetch({
    accessToken: input.accessToken,
    method: "POST",
    path: `/groups/${encodeURIComponent(input.groupId)}/datasets/${encodeURIComponent(
      input.datasetId,
    )}/Default.UpdateParameters`,
    body: {
      updateDetails: input.updates.map((u) => ({
        name: u.name,
        newValue: u.newValue,
      })),
    },
    notFoundResource: `semantic model ${input.datasetId}`,
    operation: "dataset UpdateParameters POST",
  });
}
