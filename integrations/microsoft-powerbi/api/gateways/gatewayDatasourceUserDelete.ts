import { powerbiFetch } from "../_base";

/**
 * Wrapper for Power BI
 * `DELETE /v1.0/myorg/gateways/{gatewayId}/datasources/{datasourceId}/users/{emailAddress}`
 * (Delete Datasource User).
 *
 * The principal's email/UPN travels IN THE PATH (URL-encoded here). The
 * `notFoundResource` label deliberately names the datasource, NOT the
 * email — principal emails never enter error surfaces.
 */

export interface GatewayDatasourceUserDeleteInput {
  accessToken: string;
  gatewayId: string;
  datasourceId: string;
  emailAddress: string;
}

export async function gatewayDatasourceUserDelete(
  input: GatewayDatasourceUserDeleteInput,
): Promise<void> {
  await powerbiFetch({
    accessToken: input.accessToken,
    method: "DELETE",
    path: `/gateways/${encodeURIComponent(input.gatewayId)}/datasources/${encodeURIComponent(
      input.datasourceId,
    )}/users/${encodeURIComponent(input.emailAddress)}`,
    notFoundResource: `gateway datasource ${input.datasourceId} user`,
    operation: "gateway datasource user DELETE",
  });
}
