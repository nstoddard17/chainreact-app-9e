import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { tableColumnsList } from "../api/tableColumnsList";
import { tableRowsAdd } from "../api/tableRowsAdd";
import { AddTableRowConfigSchema } from "./addTableRow.schema";

/**
 * Excel `add_table_row` action handler.
 *
 * Appends one row to the bottom of an Excel table. Tables have stable
 * row ids assigned by Graph, so this is the safer write surface for
 * change-tracking compared to worksheet position-keyed rows.
 *
 * When `values` is a Record (keyed by column name), the handler fetches
 * `/tables/{name}/columns` first and aligns the values to the table's
 * column order. When `values` is already a flat array, it is forwarded
 * as-is.
 *
 * Output shape (downstream variable refs):
 *   { rowIndex, columnCount, valuesWritten }
 */
export const addTableRow: ActionHandler = async (input) => {
  const config = AddTableRowConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-excel"
      ? input.triggerEvent.providerAccountId
      : null;

  let alignedValues: unknown[];

  if (Array.isArray(config.values)) {
    alignedValues = [...config.values];
  } else {
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
    // Graph orders columns by `index` ascending; preserve that order.
    const ordered = [...columns].sort((a, b) => a.index - b.index);
    const valuesMap = config.values;
    alignedValues = ordered.map((c) =>
      Object.prototype.hasOwnProperty.call(valuesMap, c.name)
        ? valuesMap[c.name]
        : null,
    );
  }

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-excel",
    providerAccountId,
    apiCall: (accessToken) =>
      tableRowsAdd({
        accessToken,
        workbookId: config.workbookId,
        tableName: config.tableName,
        values: [alignedValues],
      }),
  });

  return {
    output: {
      rowIndex: result.index,
      columnCount: alignedValues.length,
      valuesWritten: alignedValues,
    },
  };
};
