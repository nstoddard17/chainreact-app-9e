import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { stageFileToStorage } from "@/services/files/stageFileToStorage";
import { reportExportDownload } from "../../api/reports/reportExportDownload";
import { ExportReportDefinitionConfigSchema } from "./exportReportDefinition.schema";

/**
 * Power BI `export_report_definition` action handler.
 *
 * Downloads the report's .pbix definition (synchronous — no export
 * job), stages the bytes to V2 storage, and returns a
 * FileRef(kind=v2_storage). The file name is `report-<id>.pbix` — the
 * download endpoint returns no report display name and the handler
 * deliberately avoids a second metadata round-trip.
 *
 * Documented .pbix download limitations apply (same as the portal's
 * "Download .pbix"): models with incremental refresh and very large
 * models fail provider-side; the sanitized error propagates.
 *
 * Output: { file (FileRef), fileName }.
 */
export const exportReportDefinition: ActionHandler = async (input) => {
  const config = ExportReportDefinitionConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-powerbi"
      ? input.triggerEvent.providerAccountId
      : null;

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-powerbi",
    providerAccountId,
    apiCall: (accessToken) =>
      reportExportDownload({
        accessToken,
        groupId: config.workspaceId,
        reportId: config.reportId,
      }),
  });

  const fileName = `report-${config.reportId}.pbix`;

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
    metadata: { sourceReportId: config.reportId },
  });

  return {
    output: {
      file: staged.ref,
      fileName,
    },
  };
};
