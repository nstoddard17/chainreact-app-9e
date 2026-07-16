import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { stageFileToStorage } from "@/services/files/stageFileToStorage";
import { exportJobRun } from "../../api/reports/exportJobRun";
import { ExportPowerBiReportToFileConfigSchema } from "./exportPowerBiReportToFile.schema";

/**
 * Power BI `export_power_bi_report_to_file` action handler.
 *
 * Runs the full ExportTo job in-run: kick off → poll (Retry-After
 * honored, 40s budget — see `exportJobRun`) → download → stage bytes
 * to V2 storage → return a FileRef(kind=v2_storage). Bytes never enter
 * workflow variables (file-output contract).
 *
 * Provider constraints surfaced in the meta description: the workspace
 * must be on Premium / Embedded / Fabric capacity (ExportTo is NOT
 * supported on PPU or shared capacity), and exports that outlive the
 * 40s poll budget fail with an actionable retry hint.
 *
 * Output: { file (FileRef), fileName, format, exportId }.
 */
export const exportPowerBiReportToFile: ActionHandler = async (input) => {
  const config = ExportPowerBiReportToFileConfigSchema.parse(input.config);

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
        reportId: config.reportId,
        format: config.format,
        ...(config.pageName !== undefined && { pageName: config.pageName }),
      }),
  });

  const extension =
    result.resourceFileExtension ?? `.${config.format.toLowerCase()}`;
  const baseName =
    result.reportName !== null && result.reportName.length > 0
      ? result.reportName
      : `report-${config.reportId}`;
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
      sourceReportId: config.reportId,
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
