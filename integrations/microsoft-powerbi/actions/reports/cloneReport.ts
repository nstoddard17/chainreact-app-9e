import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { reportClone } from "../../api/reports/reportClone";
import { CloneReportConfigSchema } from "./cloneReport.schema";

/**
 * Power BI `clone_report` action handler.
 *
 * Clones a report — same workspace by default, another workspace when
 * `targetWorkspaceId` is set, rebound to another semantic model when
 * `targetSemanticModelId` is set. Requires the `Content.Create` scope
 * plus Write on the report (and Build on the target model).
 *
 * Output: { reportId, name, workspaceId } — the new report's identity
 * from the Clone response's fixed key set (`workspaceId` is null when
 * the provider omits it).
 */
export const cloneReport: ActionHandler = async (input) => {
  const config = CloneReportConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-powerbi"
      ? input.triggerEvent.providerAccountId
      : null;

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-powerbi",
    providerAccountId,
    apiCall: (accessToken) =>
      reportClone({
        accessToken,
        groupId: config.workspaceId,
        reportId: config.reportId,
        name: config.newReportName,
        ...(config.targetWorkspaceId !== undefined && {
          targetWorkspaceId: config.targetWorkspaceId,
        }),
        ...(config.targetSemanticModelId !== undefined && {
          targetModelId: config.targetSemanticModelId,
        }),
      }),
  });

  return {
    output: {
      reportId: result.id,
      name: result.name,
      workspaceId: result.workspaceId,
    },
  };
};
