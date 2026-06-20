import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { worksheetRangeGet } from "../api/worksheetRangeGet";
import { ReadRangeConfigSchema } from "./readRange.schema";

/**
 * Excel `read_range` action handler (Slice 4.EXCEL-READ-2).
 *
 * Read-only. Reads a caller-specified A1 range via the provider-local
 * `worksheetRangeGet` wrapper behind `refreshAndRetry` (Q3); GET-shaped so
 * no idempotency concern.
 *
 * Output is bounded + explicitly projected from `ExcelRange` — the raw Graph
 * envelope (and its `formulas` / `numberFormat` arrays) is never spread.
 * `values` is the cell matrix (the action's purpose) but is CAPPED at
 * MAX_OUTPUT_ROWS rows with a `truncated` flag as defense-in-depth; the true
 * `rowCount` / `columnCount` are always surfaced. Smoke reports stay
 * status-only and never surface this output.
 */
const MAX_OUTPUT_ROWS = 1000;

export const readRange: ActionHandler = async (input) => {
  const config = ReadRangeConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-excel"
      ? input.triggerEvent.providerAccountId
      : null;

  const range = await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-excel",
    providerAccountId,
    apiCall: (accessToken) =>
      worksheetRangeGet({
        accessToken,
        workbookId: config.workbookId,
        worksheetName: config.worksheetName,
        address: config.address,
      }),
  });

  const allValues = range.values ?? [];
  const truncated = allValues.length > MAX_OUTPUT_ROWS;
  const values = truncated ? allValues.slice(0, MAX_OUTPUT_ROWS) : allValues;

  return {
    output: {
      address: range.address,
      rowCount: range.rowCount,
      columnCount: range.columnCount,
      values,
      truncated,
    },
  };
};
