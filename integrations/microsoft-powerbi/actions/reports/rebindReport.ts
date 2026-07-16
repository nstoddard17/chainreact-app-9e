import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { reportRebind } from "../../api/reports/reportRebind";
import { RebindReportConfigSchema } from "./rebindReport.schema";

/**
 * Power BI `rebind_report` action handler.
 *
 * Rebinds a Power BI report to a different semantic model. Power BI
 * reports only — paginated reports are rejected provider-side (they
 * use `update_paginated_report_datasources` instead). The endpoint
 * returns an empty 200; the output echoes the ids for chaining.
 *
 * Output: { rebound: true, reportId, semanticModelId }.
 */
export const rebindReport: ActionHandler = async (input) => {
  const config = RebindReportConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-powerbi"
      ? input.triggerEvent.providerAccountId
      : null;

  await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-powerbi",
    providerAccountId,
    apiCall: (accessToken) =>
      reportRebind({
        accessToken,
        groupId: config.workspaceId,
        reportId: config.reportId,
        datasetId: config.semanticModelId,
      }),
  });

  return {
    output: {
      rebound: true,
      reportId: config.reportId,
      semanticModelId: config.semanticModelId,
    },
  };
};
