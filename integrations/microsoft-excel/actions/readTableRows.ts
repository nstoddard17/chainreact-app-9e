import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { tableRowsList } from "../api/tableRowsList";
import { ReadTableRowsConfigSchema } from "./readTableRows.schema";

/**
 * Excel `read_table_rows` action handler (Slice 4.EXCEL-READ-2).
 *
 * Read-only. Reads one bounded page of table rows via the shared
 * `tableRowsList` wrapper (with `$top`) behind `refreshAndRetry` (Q3);
 * GET-shaped so no idempotency concern. One page only — no auto-pagination.
 *
 * Output is bounded + explicitly projected: each row becomes
 * `{ index, cells }` where `cells` is the row's single cell array (Graph
 * nests row values as a length-1 outer array). The raw Graph row resource is
 * never spread. Smoke reports stay status-only and never surface this output.
 */
export const readTableRows: ActionHandler = async (input) => {
  const config = ReadTableRowsConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-excel"
      ? input.triggerEvent.providerAccountId
      : null;

  const rows = await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-excel",
    providerAccountId,
    apiCall: (accessToken) =>
      tableRowsList({
        accessToken,
        workbookId: config.workbookId,
        tableName: config.tableName,
        top: config.top,
      }),
  });

  return {
    output: {
      rows: rows.map((r) => ({ index: r.index, cells: r.values?.[0] ?? [] })),
      count: rows.length,
    },
  };
};
