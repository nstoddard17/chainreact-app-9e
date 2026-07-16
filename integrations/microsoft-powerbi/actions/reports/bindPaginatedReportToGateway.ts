import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { reportBindToGateway } from "../../api/reports/reportBindToGateway";
import { BindPaginatedReportToGatewayConfigSchema } from "./bindPaginatedReportToGateway.schema";

/**
 * Power BI `bind_paginated_report_to_gateway` action handler.
 *
 * Binds a paginated (RDL) report's data sources to an on-premises data
 * gateway. Paginated reports only; only the on-premises gateway is
 * supported (VNet/cloud gateways rejected provider-side). Both the
 * gateway id and per-data-source bind rows are required by the wire
 * contract.
 *
 * Output: { bound: true, gatewayId }.
 */
export const bindPaginatedReportToGateway: ActionHandler = async (input) => {
  const config = BindPaginatedReportToGatewayConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-powerbi"
      ? input.triggerEvent.providerAccountId
      : null;

  await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-powerbi",
    providerAccountId,
    apiCall: (accessToken) =>
      reportBindToGateway({
        accessToken,
        groupId: config.workspaceId,
        reportId: config.paginatedReportId,
        gatewayObjectId: config.gatewayId,
        bindDetails: config.bindDetails,
      }),
  });

  return {
    output: {
      bound: true,
      gatewayId: config.gatewayId,
    },
  };
};
