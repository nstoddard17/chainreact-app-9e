import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { lineItemsUpdate } from "../../_shared/hubspot/api/lineItems";
import { UpdateLineItemConfigSchema } from "./updateLineItem.schema";

const UPDATABLE_FIELDS = ["name", "quantity", "price", "discount"] as const;

/**
 * HubSpot `update_line_item` action handler — Slice 13 Batch 2.
 *
 * PATCHes `/crm/v3/objects/line_items/{id}` with non-empty supplied
 * fields. Throws if no property fields are provided.
 */
export const updateLineItem: ActionHandler = async (input) => {
  const config = UpdateLineItemConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "hubspot"
      ? input.triggerEvent.accountId
      : null;

  const properties: Record<string, string> = {};
  for (const k of UPDATABLE_FIELDS) {
    const v = config[k];
    if (typeof v === "string" && v.length > 0) {
      properties[k] = v;
    }
  }
  if (Object.keys(properties).length === 0) {
    throw new Error(
      "hubspot update_line_item: at least one property field must be provided.",
    );
  }

  const lineItem = await refreshAndRetry({
    userId: input.userId,
    provider: "hubspot",
    accountId,
    apiCall: (accessToken) =>
      lineItemsUpdate({
        accessToken,
        lineItemId: config.lineItemId,
        properties,
      }),
  });

  return {
    output: {
      lineItemId: lineItem.id,
      name: lineItem.properties.name ?? null,
      quantity: lineItem.properties.quantity ?? null,
      price: lineItem.properties.price ?? null,
      discount: lineItem.properties.discount ?? null,
      amount: lineItem.properties.amount ?? null,
      updatedAt: lineItem.updatedAt ?? null,
      properties: lineItem.properties,
    },
  };
};
