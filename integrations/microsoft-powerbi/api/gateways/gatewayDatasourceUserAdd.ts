import { powerbiFetch } from "../_base";

/**
 * Wrapper for Power BI
 * `POST /v1.0/myorg/gateways/{gatewayId}/datasources/{datasourceId}/users`
 * (Add Datasource User).
 *
 * Body wire names per the documented request: `emailAddress` +
 * `datasourceAccessRight`. (The docs' DELETE path label carries the
 * `{emailAdress}` typo — the POST body field is `emailAddress`, correctly
 * spelled.) Adding groups through this API is documented as unsupported;
 * this wrapper only sends user email principals.
 */

export interface GatewayDatasourceUserAddInput {
  accessToken: string;
  gatewayId: string;
  datasourceId: string;
  emailAddress: string;
  datasourceAccessRight: "Read" | "ReadOverrideEffectiveIdentity";
}

export async function gatewayDatasourceUserAdd(
  input: GatewayDatasourceUserAddInput,
): Promise<void> {
  await powerbiFetch({
    accessToken: input.accessToken,
    method: "POST",
    path: `/gateways/${encodeURIComponent(input.gatewayId)}/datasources/${encodeURIComponent(
      input.datasourceId,
    )}/users`,
    body: {
      emailAddress: input.emailAddress,
      datasourceAccessRight: input.datasourceAccessRight,
    },
    notFoundResource: `gateway datasource ${input.datasourceId}`,
    operation: "gateway datasource user add POST",
  });
}
