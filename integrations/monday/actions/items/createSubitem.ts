import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { subitemsCreate } from "@/integrations/_shared/monday/api/subitemsCreate";
import { CreateSubitemConfigSchema } from "./createSubitem.schema";

/**
 * Monday `create_subitem` action handler — Slice 3.MONDAY-2.
 *
 * Creates a subitem under a parent. The subitems board id is opaque
 * to workflow authors (D-MON6) — Monday resolves it from the parent.
 *
 * Output shape:
 *   {
 *     subitemId: string,
 *     subitemName: string,
 *     parentItemId: string,
 *     boardId: string | null,    // resolved subitems-board id
 *     createdAt: string | null
 *   }
 */

function serializeColumnValues(
  raw: string | Record<string, unknown> | undefined,
): string | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw === "string") return raw;
  return JSON.stringify(raw);
}

export const createSubitem: ActionHandler = async (input) => {
  const config = CreateSubitemConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "monday"
      ? input.triggerEvent.providerAccountId
      : null;

  const columnValuesJson = serializeColumnValues(config.columnValues);

  const subitem = await refreshAndRetry({
    accountId: input.accountId,
    provider: "monday",
    providerAccountId,
    apiCall: (accessToken) =>
      subitemsCreate({
        accessToken,
        parentItemId: config.parentItemId,
        subitemName: config.subitemName,
        columnValuesJson,
      }),
  });

  return {
    output: {
      subitemId: subitem.id,
      subitemName: subitem.name ?? config.subitemName,
      parentItemId: config.parentItemId,
      boardId: subitem.board?.id ?? null,
      createdAt: subitem.created_at ?? null,
    },
  };
};
