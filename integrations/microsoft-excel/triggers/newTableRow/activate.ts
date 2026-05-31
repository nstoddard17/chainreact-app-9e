import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { ActivationFn } from "@/services/triggers/activationRegistry";
import { tableRowsList } from "../../api/tableRowsList";
import { buildSnapshot } from "../_shared/snapshot";
import { ExcelNewTableRowConfigSchema } from "./schema";

/**
 * Excel `new_table_row` activation hook.
 *
 * Seeds the row-hash snapshot at activation time, BEFORE the first poll
 * runs. Closes V1's "first poll miss" bug — failure to seed throws and
 * aborts activation rather than silently degrading.
 *
 * Table rows have stable Graph-issued `index` values that survive
 * mid-table insertions/deletions, so the snapshot key is `index` (not
 * a position counter).
 */
export const activate: ActivationFn = async ({ integration, node }) => {
  const parsed = ExcelNewTableRowConfigSchema.parse({
    workbookId: (node.config as { workbookId?: string }).workbookId,
    tableName: (node.config as { tableName?: string }).tableName,
  });

  const rows = await refreshAndRetry({
    accountId: integration.accountId,
    provider: "microsoft-excel",
    providerAccountId: integration.providerAccountId,
    apiCall: (accessToken) =>
      tableRowsList({
        accessToken,
        workbookId: parsed.workbookId,
        tableName: parsed.tableName,
      }),
  });

  // Snapshot keyed on Graph's stable row index.
  const entries = rows.map((r) => ({
    key: String(r.index),
    values: r.values[0] ?? [],
  }));

  return {
    pollingEnabled: true,
    snapshot: buildSnapshot(entries),
  };
};
