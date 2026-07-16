import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { reportDatasourcesUpdate } from "../../api/reports/reportDatasourcesUpdate";
import { UpdatePaginatedReportDatasourcesConfigSchema } from "./updatePaginatedReportDatasources.schema";

/**
 * Power BI `update_paginated_report_datasources` action handler.
 *
 * Retargets the data sources of a paginated (RDL) report — selected by
 * data source NAME — to a new server and/or database. Paginated
 * reports only; the caller must be the data source owner; original and
 * new source must share the exact same schema (documented provider
 * constraints — violations propagate as sanitized provider errors).
 *
 * Output: { updated: true, updateCount }.
 */
export const updatePaginatedReportDatasources: ActionHandler = async (
  input,
) => {
  const config = UpdatePaginatedReportDatasourcesConfigSchema.parse(
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
      reportDatasourcesUpdate({
        accessToken,
        groupId: config.workspaceId,
        reportId: config.paginatedReportId,
        updates: config.updates,
      }),
  });

  return {
    output: {
      updated: true,
      updateCount: config.updates.length,
    },
  };
};
