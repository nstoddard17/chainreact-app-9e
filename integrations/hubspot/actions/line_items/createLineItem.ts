import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { attachAssociations } from "../../../_shared/hubspot/api/associations";
import { lineItemsCreate } from "../../../_shared/hubspot/api/lineItems";
import { CreateLineItemConfigSchema } from "./createLineItem.schema";

/**
 * HubSpot `create_line_item` action handler — Slice 13 Batch 2.
 *
 * POSTs `/crm/v3/objects/line_items` with the supplied properties,
 * then associates the new line item to `dealId` via the v4 default-
 * typed association (line_item → deal, HubSpot-defined type 20).
 *
 * Either `hs_product_id` (link to existing product) OR `name`
 * (free-form line item) MUST be present — handler enforces. HubSpot
 * accepts either; without one of them the create fails with a
 * confusing validation error, so fail-fast at the handler boundary.
 */
export const createLineItem: ActionHandler = async (input) => {
  const config = CreateLineItemConfigSchema.parse(input.config);

  if (!config.hs_product_id && !config.name) {
    throw new Error(
      "hubspot create_line_item: at least one of `hs_product_id` or `name` must be provided.",
    );
  }

  const providerAccountId =
    input.triggerEvent.provider === "hubspot"
      ? input.triggerEvent.providerAccountId
      : null;

  const properties: Record<string, string> = {
    quantity: config.quantity,
  };
  if (config.hs_product_id) properties.hs_product_id = config.hs_product_id;
  if (config.name) properties.name = config.name;
  if (config.price) properties.price = config.price;
  if (config.discount) properties.discount = config.discount;

  const lineItem = await refreshAndRetry({
    accountId: input.accountId,
    provider: "hubspot",
    providerAccountId,
    apiCall: (accessToken) =>
      lineItemsCreate({ accessToken, properties }),
  });

  // Always associate to the deal — that's the whole purpose of a line
  // item. Failure surfaces as a warning (the line item itself exists).
  const assoc = await refreshAndRetry({
    accountId: input.accountId,
    provider: "hubspot",
    providerAccountId,
    apiCall: (accessToken) =>
      attachAssociations({
        accessToken,
        fromType: "line_items",
        fromId: lineItem.id,
        toIds: { deals: config.dealId },
      }),
  });

  return {
    output: {
      lineItemId: lineItem.id,
      dealId: config.dealId,
      productId: lineItem.properties.hs_product_id ?? null,
      name: lineItem.properties.name ?? null,
      quantity: lineItem.properties.quantity ?? config.quantity,
      price: lineItem.properties.price ?? null,
      discount: lineItem.properties.discount ?? null,
      amount: lineItem.properties.amount ?? null,
      createdAt: lineItem.createdAt ?? null,
      properties: lineItem.properties,
      associationsAttached: assoc.attached,
      associationWarnings: assoc.warnings,
    },
  };
};
