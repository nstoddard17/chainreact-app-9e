import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { lineItemsDelete } from "../../../_shared/hubspot/api/lineItems";
import { RemoveLineItemConfigSchema } from "./removeLineItem.schema";

/**
 * HubSpot `remove_line_item` action handler — HubSpot 2.1.
 *
 * Calls `DELETE /crm/v3/objects/line_items/{lineItemId}` via the
 * shared wrapper. HubSpot returns 204 on success; the wrapper
 * surfaces 404 as `NotFoundError` (naturally idempotent — replaying
 * the same DELETE returns the same 404).
 *
 * Output is bounded:
 *   { lineItemId, deleted: true }
 *
 * No raw HubSpot response spread (DELETE returns 204 — nothing to
 * spread anyway).
 */
export const removeLineItem: ActionHandler = async (input) => {
  const config = RemoveLineItemConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "hubspot"
      ? input.triggerEvent.accountId
      : null;

  await refreshAndRetry({
    userId: input.userId,
    provider: "hubspot",
    accountId,
    apiCall: (accessToken) =>
      lineItemsDelete({ accessToken, lineItemId: config.lineItemId }),
  });

  return {
    output: {
      lineItemId: config.lineItemId,
      deleted: true,
    },
  };
};
