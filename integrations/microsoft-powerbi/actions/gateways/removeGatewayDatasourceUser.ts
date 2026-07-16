import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { gatewayDatasourceUserDelete } from "../../api/gateways/gatewayDatasourceUserDelete";
import { RemoveGatewayDatasourceUserConfigSchema } from "./removeGatewayDatasourceUser.schema";

/**
 * Power BI `remove_gateway_datasource_user` action handler.
 *
 * Revokes a principal's access to a gateway data source (Delete
 * Datasource User — the email travels URL-encoded in the path). The
 * removed principal loses the ability to bind/refresh datasets through
 * this data source immediately.
 */
export const removeGatewayDatasourceUser: ActionHandler = async (input) => {
  const config = RemoveGatewayDatasourceUserConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-powerbi"
      ? input.triggerEvent.providerAccountId
      : null;

  await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-powerbi",
    providerAccountId,
    apiCall: (accessToken) =>
      gatewayDatasourceUserDelete({
        accessToken,
        gatewayId: config.gatewayId,
        datasourceId: config.datasourceId,
        emailAddress: config.principalEmail,
      }),
  });

  return {
    output: {
      removed: true,
    },
  };
};
