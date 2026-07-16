import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { gatewayDatasourceUserAdd } from "../../api/gateways/gatewayDatasourceUserAdd";
import { AddOrUpdateGatewayDatasourceUserConfigSchema } from "./addOrUpdateGatewayDatasourceUser.schema";

/**
 * Power BI `add_or_update_gateway_datasource_user` action handler.
 *
 * Grants a user access to a gateway data source (Add Datasource User).
 * Wire names per the documented request body: `emailAddress` +
 * `datasourceAccessRight`. Groups are documented as unsupported by this
 * API — only user email/UPN principals are sent.
 */
export const addOrUpdateGatewayDatasourceUser: ActionHandler = async (
  input,
) => {
  const config = AddOrUpdateGatewayDatasourceUserConfigSchema.parse(
    input.config,
  );

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-powerbi"
      ? input.triggerEvent.providerAccountId
      : null;

  await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-powerbi",
    providerAccountId,
    apiCall: (accessToken) =>
      gatewayDatasourceUserAdd({
        accessToken,
        gatewayId: config.gatewayId,
        datasourceId: config.datasourceId,
        emailAddress: config.principalEmail,
        datasourceAccessRight: config.accessRight,
      }),
  });

  return {
    output: {
      granted: true,
      principalEmail: config.principalEmail,
      accessRight: config.accessRight,
    },
  };
};
