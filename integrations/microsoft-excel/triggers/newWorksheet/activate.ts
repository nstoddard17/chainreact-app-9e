import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { ActivationFn } from "@/services/triggers/activationRegistry";
import { worksheetsList } from "../../api/worksheetsList";
import { buildWorksheetListSnapshot } from "../_shared/snapshot";
import { ExcelNewWorksheetConfigSchema } from "./schema";

/**
 * Excel `new_worksheet` activation hook.
 *
 * Seeds the worksheet-name list at activation time, BEFORE the first
 * poll runs. Closes V1's "first poll miss" bug: V1 used to skip the
 * trigger when no prior snapshot existed, silently dropping worksheets
 * created between activation and first poll. V2 fails activation when
 * the seed throws — the orchestrator wraps as TRIGGER_REGISTRATION_FAILED.
 *
 * Pre-existing worksheets are NOT replayed — only sheets added after
 * activation fire.
 */
export const activate: ActivationFn = async ({ integration, node }) => {
  const parsed = ExcelNewWorksheetConfigSchema.parse({
    workbookId: (node.config as { workbookId?: string }).workbookId,
  });

  const sheets = await refreshAndRetry({
    userId: integration.userId,
    provider: "microsoft-excel",
    accountId: integration.providerAccountId,
    apiCall: (accessToken) =>
      worksheetsList({
        accessToken,
        workbookId: parsed.workbookId,
      }),
  });

  const names = sheets
    .map((s) => s.name)
    .filter((n): n is string => typeof n === "string" && n.length > 0);

  return {
    pollingEnabled: true,
    snapshot: buildWorksheetListSnapshot(names),
  };
};
