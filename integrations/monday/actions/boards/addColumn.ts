import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { columnsCreate } from "@/integrations/_shared/monday/api/columnsCreate";
import { AddColumnConfigSchema } from "./addColumn.schema";

/**
 * Monday `add_column` action handler — Slice 3.MONDAY-4.
 *
 * Adds a column to a board. `defaults` (optional) is passed through to
 * Monday's `create_column` `defaults: JSON` arg verbatim — same raw-
 * JSON passthrough stance as `create_item`'s columnValues. Friendly
 * per-type builders are future polish (D-MON7).
 *
 * Output:
 *   { columnId, columnTitle, columnType, boardId, createdAt }
 */

function serializeDefaults(
  raw: string | Record<string, unknown> | undefined,
): string | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw === "string") return raw;
  return JSON.stringify(raw);
}

export const addColumn: ActionHandler = async (input) => {
  const config = AddColumnConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "monday"
      ? input.triggerEvent.providerAccountId
      : null;

  const defaultsJson = serializeDefaults(config.defaults);

  const column = await refreshAndRetry({
    accountId: input.accountId,
    provider: "monday",
    providerAccountId,
    apiCall: (accessToken) =>
      columnsCreate({
        accessToken,
        boardId: config.boardId,
        title: config.columnTitle,
        columnType: config.columnType,
        defaultsJson,
      }),
  });

  return {
    output: {
      columnId: column.id,
      columnTitle: column.title ?? config.columnTitle,
      columnType: column.type ?? config.columnType,
      boardId: config.boardId,
      createdAt: new Date().toISOString(),
    },
  };
};
