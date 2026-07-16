import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { importGet } from "../../api/imports/importGet";
import { GetImportStatusConfigSchema } from "./getImportStatus.schema";

/**
 * Power BI `get_import_status` action handler.
 *
 * Reads one import's state (Publishing | Succeeded | Failed) plus the
 * datasets/reports it produced. This is the poll target after
 * `import_power_bi_file` — authors compose a loop on `importState`.
 *
 * Output shape:
 *   { importState, name, createdDateTime, updatedDateTime,
 *     reports: [{id, name}], datasets: [{id, name}] }
 */
export const getImportStatus: ActionHandler = async (input) => {
  const config = GetImportStatusConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-powerbi"
      ? input.triggerEvent.providerAccountId
      : null;

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-powerbi",
    providerAccountId,
    apiCall: (accessToken) =>
      importGet({
        accessToken,
        groupId: config.workspaceId,
        importId: config.importId,
      }),
  });

  return {
    output: {
      importState: result.importState,
      name: result.name,
      createdDateTime: result.createdDateTime,
      updatedDateTime: result.updatedDateTime,
      reports: result.reports.map((r) => ({ id: r.id, name: r.name })),
      datasets: result.datasets.map((d) => ({ id: d.id, name: d.name })),
    },
  };
};
