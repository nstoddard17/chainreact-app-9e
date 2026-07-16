import { powerbiFetch } from "../_base";

/**
 * Wrapper for Power BI
 * `GET /v1.0/myorg/gateways/{gatewayId}/datasources/{datasourceId}/users`
 * (Get Datasource Users).
 *
 * Lists the principals with access to one gateway data source. Users
 * carry `emailAddress`; service principals carry `identifier` — both are
 * surfaced (fixed key set) so the picker can address either.
 */

export interface GatewayDatasourceUsersListInput {
  accessToken: string;
  gatewayId: string;
  datasourceId: string;
}

export interface PowerBiGatewayDatasourceUser {
  emailAddress: string | null;
  identifier: string | null;
  displayName: string | null;
  datasourceAccessRight: string | null;
  principalType: string | null;
}

interface GatewayDatasourceUsersListBody {
  value?: Array<{
    emailAddress?: string;
    identifier?: string;
    displayName?: string;
    datasourceAccessRight?: string;
    principalType?: string;
  }>;
}

export async function gatewayDatasourceUsersList(
  input: GatewayDatasourceUsersListInput,
): Promise<PowerBiGatewayDatasourceUser[]> {
  const res = await powerbiFetch({
    accessToken: input.accessToken,
    method: "GET",
    path: `/gateways/${encodeURIComponent(input.gatewayId)}/datasources/${encodeURIComponent(
      input.datasourceId,
    )}/users`,
    notFoundResource: `gateway datasource ${input.datasourceId}`,
    operation: "gateway datasource users GET",
  });

  const body = (await res.json()) as GatewayDatasourceUsersListBody;
  const rows = body.value ?? [];
  const users: PowerBiGatewayDatasourceUser[] = [];
  for (const row of rows) {
    users.push({
      emailAddress:
        typeof row.emailAddress === "string" ? row.emailAddress : null,
      identifier: typeof row.identifier === "string" ? row.identifier : null,
      displayName:
        typeof row.displayName === "string" ? row.displayName : null,
      datasourceAccessRight:
        typeof row.datasourceAccessRight === "string"
          ? row.datasourceAccessRight
          : null,
      principalType:
        typeof row.principalType === "string" ? row.principalType : null,
    });
  }
  return users;
}
