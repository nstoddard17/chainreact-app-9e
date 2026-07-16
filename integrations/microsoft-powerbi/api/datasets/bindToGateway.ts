import { powerbiFetch } from "../_base";

/**
 * Wrapper for Power BI
 * `POST /v1.0/myorg/groups/{groupId}/datasets/{datasetId}/Default.BindToGateway`
 * (Bind To Gateway In Group).
 *
 * Body: `{ gatewayObjectId, datasourceObjectIds? }` — the datasource ids
 * are sent only when non-empty; when omitted Power BI binds to the first
 * matching data source in the gateway. Only supports the on-premises
 * data gateway; the caller must be a data source user on the gateway.
 * Success is HTTP 200 with no meaningful body.
 */

export interface BindToGatewayInput {
  accessToken: string;
  groupId: string;
  datasetId: string;
  gatewayObjectId: string;
  datasourceObjectIds?: string[];
}

export async function bindToGateway(
  input: BindToGatewayInput,
): Promise<void> {
  const body: Record<string, unknown> = {
    gatewayObjectId: input.gatewayObjectId,
  };
  if (input.datasourceObjectIds && input.datasourceObjectIds.length > 0) {
    body.datasourceObjectIds = input.datasourceObjectIds;
  }

  await powerbiFetch({
    accessToken: input.accessToken,
    method: "POST",
    path: `/groups/${encodeURIComponent(input.groupId)}/datasets/${encodeURIComponent(
      input.datasetId,
    )}/Default.BindToGateway`,
    body,
    notFoundResource: `semantic model ${input.datasetId}`,
    operation: "dataset BindToGateway POST",
  });
}
