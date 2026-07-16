import { powerbiFetch } from "../_base";

/**
 * Wrapper for Power BI `GET /v1.0/myorg/gateways/{gatewayId}/datasources`
 * (Get Datasources).
 *
 * Lists the data sources on one on-premises gateway. Response rows follow
 * the documented `GatewayDatasource` model (`id`, `gatewayId`,
 * `datasourceName`, `datasourceType`, `connectionDetails`) — note the
 * RESPONSE casing is `datasourceType` while the CREATE request uses
 * `dataSourceType` (documented asymmetry). `connectionDetails` and
 * credential material are deliberately NOT mapped.
 */

export interface GatewayDatasourcesListInput {
  accessToken: string;
  gatewayId: string;
}

export interface PowerBiGatewayDatasource {
  id: string;
  datasourceName: string | null;
  datasourceType: string | null;
}

interface GatewayDatasourcesListBody {
  value?: Array<{
    id?: string;
    datasourceName?: string;
    datasourceType?: string;
  }>;
}

export async function gatewayDatasourcesList(
  input: GatewayDatasourcesListInput,
): Promise<PowerBiGatewayDatasource[]> {
  const res = await powerbiFetch({
    accessToken: input.accessToken,
    method: "GET",
    path: `/gateways/${encodeURIComponent(input.gatewayId)}/datasources`,
    notFoundResource: `gateway ${input.gatewayId}`,
    operation: "gateway datasources GET",
  });

  const body = (await res.json()) as GatewayDatasourcesListBody;
  const rows = body.value ?? [];
  const datasources: PowerBiGatewayDatasource[] = [];
  for (const row of rows) {
    if (typeof row.id !== "string") continue;
    datasources.push({
      id: row.id,
      datasourceName:
        typeof row.datasourceName === "string" ? row.datasourceName : null,
      datasourceType:
        typeof row.datasourceType === "string" ? row.datasourceType : null,
    });
  }
  return datasources;
}
