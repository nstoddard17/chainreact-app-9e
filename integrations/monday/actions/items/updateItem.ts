import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { itemsUpdate } from "@/integrations/_shared/monday/api/itemsUpdate";
import { UpdateItemConfigSchema } from "./updateItem.schema";

/**
 * Monday `update_item` action handler — Slice 3.MONDAY-2.
 *
 * Updates one or more columns on an item via the universal
 * `change_multiple_column_values` mutation. V1 funnels the single-
 * column path through the same mutation rather than using
 * `change_simple_column_value` (which only handles text columns).
 *
 * Field merge:
 *   - `(columnId, columnValue)` becomes a single-key map.
 *   - If `additionalColumns` is supplied (string-JSON or object), its
 *     entries merge in, with `columnId` winning on key conflict
 *     (matches V1's spread order).
 *
 * Output shape:
 *   {
 *     itemId: string,
 *     itemName: string | null,
 *     updatedColumns: string[],
 *     updatedAt: string
 *   }
 *
 *   `updatedAt` is synthesized client-side — Monday's GraphQL
 *   response doesn't return a timestamp. Same approach as V1.
 */

function parseAdditional(
  raw: string | Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (raw === undefined) return {};
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      throw new Error("additionalColumns must parse to an object.");
    } catch {
      throw new Error("additionalColumns must be valid JSON.");
    }
  }
  return raw;
}

export const updateItem: ActionHandler = async (input) => {
  const config = UpdateItemConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "monday"
      ? input.triggerEvent.accountId
      : null;

  const additional = parseAdditional(config.additionalColumns);
  const columnValuesMap: Record<string, unknown> = {
    ...additional,
    [config.columnId]: config.columnValue,
  };
  const columnValuesJson = JSON.stringify(columnValuesMap);

  const result = await refreshAndRetry({
    userId: input.userId,
    provider: "monday",
    accountId,
    apiCall: (accessToken) =>
      itemsUpdate({
        accessToken,
        boardId: config.boardId,
        itemId: config.itemId,
        columnValuesJson,
      }),
  });

  return {
    output: {
      itemId: result.id,
      itemName: result.name ?? null,
      updatedColumns: Object.keys(columnValuesMap),
      updatedAt: new Date().toISOString(),
    },
  };
};
