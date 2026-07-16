import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { gatewayDatasourceStatusGet } from "../../api/gateways/gatewayDatasourceStatusGet";
import { TestGatewayDatasourceConnectionConfigSchema } from "./testGatewayDatasourceConnection.schema";

/**
 * Power BI `test_gateway_datasource_connection` action handler.
 *
 * Checks whether the gateway can reach the data source (Get Datasource
 * Status). Connectivity FAILURE is the RESULT of this action, not an
 * error — the run continues and downstream nodes branch on `online` /
 * `errorCode` (e.g. "DM_GWPipeline_Client_GatewayUnreachable"). Only
 * auth failures and a missing gateway/datasource throw.
 */
export const testGatewayDatasourceConnection: ActionHandler = async (
  input,
) => {
  const config = TestGatewayDatasourceConnectionConfigSchema.parse(
    input.config,
  );

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-powerbi"
      ? input.triggerEvent.providerAccountId
      : null;

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-powerbi",
    providerAccountId,
    apiCall: (accessToken) =>
      gatewayDatasourceStatusGet({
        accessToken,
        gatewayId: config.gatewayId,
        datasourceId: config.datasourceId,
      }),
  });

  return {
    output: {
      online: result.online,
      errorCode: result.errorCode,
    },
  };
};
