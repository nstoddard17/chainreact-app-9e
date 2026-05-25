import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { ActivationFn } from "@/services/triggers/activationRegistry";
import { worksheetUsedRange } from "../../api/worksheetUsedRange";
import { buildSnapshot } from "../_shared/snapshot";
import { ExcelUpdatedRowConfigSchema } from "./schema";

/**
 * Excel `updated_row` activation hook.
 *
 * Seeds the row-hash snapshot at activation time, BEFORE the first poll
 * runs. Closes V1's "first poll miss" bug — failure to seed throws and
 * aborts activation rather than silently degrading.
 *
 * Pre-activation row content is the baseline; only subsequent value
 * changes at a given 1-based row index fire the trigger.
 */
export const activate: ActivationFn = async ({ integration, node }) => {
  const parsed = ExcelUpdatedRowConfigSchema.parse({
    workbookId: (node.config as { workbookId?: string }).workbookId,
    worksheetName: (node.config as { worksheetName?: string }).worksheetName,
  });

  const range = await refreshAndRetry({
    userId: integration.userId,
    provider: "microsoft-excel",
    accountId: integration.providerAccountId,
    apiCall: (accessToken) =>
      worksheetUsedRange({
        accessToken,
        workbookId: parsed.workbookId,
        worksheetName: parsed.worksheetName,
        valuesOnly: true,
      }),
  });

  // Same empty-worksheet detection as new_row: Graph emits a 1x1
  // envelope with a single null cell for a worksheet with no content.
  const allValues = range.values ?? [];
  const isEmpty =
    allValues.length === 0 ||
    (allValues.length === 1 &&
      (allValues[0]?.length ?? 0) === 1 &&
      (allValues[0]![0] === null || allValues[0]![0] === undefined));

  const entries = isEmpty
    ? []
    : allValues.map((row, index) => ({
        key: String(index + 1),
        values: row,
      }));

  return {
    pollingEnabled: true,
    snapshot: buildSnapshot(entries),
  };
};
