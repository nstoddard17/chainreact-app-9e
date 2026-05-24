import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { updatesCreate } from "@/integrations/_shared/monday/api/updatesCreate";
import { CreateUpdateConfigSchema } from "./createUpdate.schema";

/**
 * Monday `create_update` action handler — Slice 3.MONDAY-2.
 *
 * Posts a comment / update to an item.
 *
 * Output shape:
 *   {
 *     updateId: string,
 *     itemId: string,
 *     body: string,
 *     createdAt: string
 *   }
 *
 *   `createdAt` is synthesized client-side — V1 deliberately doesn't
 *   request `created_at` from the GraphQL response (some account
 *   configs require elevated `updates:read` for that field). We
 *   mirror V1's choice and synthesize the timestamp here.
 */
export const createUpdate: ActionHandler = async (input) => {
  const config = CreateUpdateConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "monday"
      ? input.triggerEvent.accountId
      : null;

  const update = await refreshAndRetry({
    userId: input.userId,
    provider: "monday",
    accountId,
    apiCall: (accessToken) =>
      updatesCreate({
        accessToken,
        itemId: config.itemId,
        body: config.body,
      }),
  });

  return {
    output: {
      updateId: update.id,
      itemId: config.itemId,
      body: config.body,
      createdAt: new Date().toISOString(),
    },
  };
};
