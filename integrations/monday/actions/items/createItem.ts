import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { itemsCreate } from "@/integrations/_shared/monday/api/itemsCreate";
import { CreateItemConfigSchema } from "./createItem.schema";

/**
 * Monday `create_item` action handler — Slice 3.MONDAY-2.
 *
 * Wraps Monday GraphQL `create_item` via the shared
 * `itemsCreate` wrapper. The principal outbound write is wrapped in
 * `refreshAndRetry` per the Q3 contract — a 401 fires exactly one
 * refresh + retry.
 *
 * Idempotency: Monday's GraphQL API does not expose a native
 * idempotency-key mechanism. V2 mirrors the Google Docs / OneNote
 * pattern — no `buildIdempotencyKey` usage at this layer. Within-run
 * retries fire the create twice (engine-level retries are guarded by
 * the engine's own retry policy, not handler dedup).
 *
 * columnValues handling: the wire format is a JSON-encoded STRING.
 * Workflow authors can supply either a string (raw JSON typed in a
 * textarea) or a structured object (downstream variable refs); the
 * handler normalizes to the string form before calling.
 *
 * Output shape:
 *   {
 *     itemId: string,
 *     itemName: string,
 *     boardId: string,
 *     groupId: string,
 *     createdAt: string | null
 *   }
 *
 * accountId resolution: mirrors every other V2 handler — read from
 * `triggerEvent.providerAccountId` when the run was started by a Monday
 * trigger; otherwise null (the `getActiveForExecution` call inside
 * `refreshAndRetry` resolves the single connected integration).
 */

function serializeColumnValues(
  raw: string | Record<string, unknown> | undefined,
): string | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw === "string") {
    // Author-typed JSON in a textarea — Monday's wire format wants a
    // JSON-encoded string. If the input is already a JSON string we
    // pass it through; if it parses to an object we still pass through
    // the original to preserve the author's exact wire shape.
    return raw;
  }
  return JSON.stringify(raw);
}

export const createItem: ActionHandler = async (input) => {
  const config = CreateItemConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "monday"
      ? input.triggerEvent.providerAccountId
      : null;

  const columnValuesJson = serializeColumnValues(config.columnValues);

  const item = await refreshAndRetry({
    accountId: input.accountId,
    provider: "monday",
    providerAccountId,
    apiCall: (accessToken) =>
      itemsCreate({
        accessToken,
        boardId: config.boardId,
        groupId: config.groupId,
        itemName: config.itemName,
        columnValuesJson,
      }),
  });

  return {
    output: {
      itemId: item.id,
      itemName: item.name ?? config.itemName,
      boardId: item.board?.id ?? config.boardId,
      groupId: item.group?.id ?? config.groupId,
      createdAt: item.created_at ?? null,
    },
  };
};
