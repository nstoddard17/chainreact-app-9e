import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { tableColumnsList } from "../api/tableColumnsList";
import { tableRowsList } from "../api/tableRowsList";
import { FindRowConfigSchema } from "./findRow.schema";

/**
 * Excel `find_row` action handler (Slice 4.EXCEL-READ-2).
 *
 * Read-only. Resolves the lookup column's index from the table's columns,
 * then scans one bounded page of rows (both via existing wrappers, behind
 * `refreshAndRetry`) for the first row whose cell in that column
 * string-equals `lookupValue`. No new shared infrastructure.
 *
 * A missing lookup column is an error (the caller named a column that does
 * not exist); a scan that finds nothing is NOT an error — it returns
 * `found: false`. Output is bounded + explicitly projected
 * (`{ index, cells }`); the raw Graph row resource is never spread. Smoke
 * reports stay status-only and never surface this output.
 */
export const findRow: ActionHandler = async (input) => {
  const config = FindRowConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-excel"
      ? input.triggerEvent.providerAccountId
      : null;

  const columns = await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-excel",
    providerAccountId,
    apiCall: (accessToken) =>
      tableColumnsList({
        accessToken,
        workbookId: config.workbookId,
        tableName: config.tableName,
      }),
  });

  const column = columns.find((c) => c.name === config.lookupColumn);
  if (!column) {
    throw new Error(
      `Excel find_row: column '${config.lookupColumn}' not found in table '${config.tableName}'.`,
    );
  }

  const rows = await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-excel",
    providerAccountId,
    apiCall: (accessToken) =>
      tableRowsList({
        accessToken,
        workbookId: config.workbookId,
        tableName: config.tableName,
        top: config.maxRows,
      }),
  });

  const needle = String(config.lookupValue);
  let firstMatch: { index: number; cells: ReadonlyArray<unknown> } | null = null;
  for (const row of rows) {
    const cells = row.values?.[0] ?? [];
    const cell = cells[column.index];
    if (cell === undefined || cell === null) continue;
    if (String(cell) === needle) {
      firstMatch = { index: row.index, cells };
      break;
    }
  }

  return {
    output: {
      found: firstMatch !== null,
      firstMatch,
      scanned: rows.length,
    },
  };
};
