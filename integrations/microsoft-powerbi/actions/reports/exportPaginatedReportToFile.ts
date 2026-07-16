import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { stageFileToStorage } from "@/services/files/stageFileToStorage";
import { exportJobRun } from "../../api/reports/exportJobRun";
import { ExportPaginatedReportToFileConfigSchema } from "./exportPaginatedReportToFile.schema";

/**
 * Power BI `export_paginated_report_to_file` action handler.
 *
 * Same ExportTo job pattern as `export_power_bi_report_to_file`
 * (kick off → poll with Retry-After + 40s budget → download → stage →
 * FileRef), run against a paginated (RDL) report with optional RDL
 * `parameterValues`. Requires Premium / Embedded / Fabric capacity.
 *
 * Output: { file (FileRef), fileName, format, exportId }.
 */

/** Extension fallback when Power BI omits `resourceFileExtension`. */
function fallbackExtension(format: string): string {
  return format === "ACCESSIBLEPDF" ? ".pdf" : `.${format.toLowerCase()}`;
}

export const exportPaginatedReportToFile: ActionHandler = async (input) => {
  const config = ExportPaginatedReportToFileConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-powerbi"
      ? input.triggerEvent.providerAccountId
      : null;

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-powerbi",
    providerAccountId,
    apiCall: (accessToken) =>
      exportJobRun({
        accessToken,
        groupId: config.workspaceId,
        reportId: config.paginatedReportId,
        format: config.format,
        ...(config.parameterValues !== undefined && {
          parameterValues: config.parameterValues,
        }),
      }),
  });

  const extension =
    result.resourceFileExtension ?? fallbackExtension(config.format);
  const baseName =
    result.reportName !== null && result.reportName.length > 0
      ? result.reportName
      : `report-${config.paginatedReportId}`;
  const fileName = `${baseName}${extension}`;

  const staged = await stageFileToStorage({
    userId: input.userId,
    workflowId: input.workflowId,
    runId: input.runId,
    nodeId: input.nodeId,
    fileName,
    mimeType: result.contentType,
    bytes: result.bytes,
    sizeBytes: result.bytes.byteLength,
    provider: "microsoft-powerbi",
    metadata: {
      sourceReportId: config.paginatedReportId,
      format: config.format,
      exportId: result.exportId,
    },
  });

  return {
    output: {
      file: staged.ref,
      fileName,
      format: config.format,
      exportId: result.exportId ?? null,
    },
  };
};
