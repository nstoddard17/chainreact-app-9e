import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { customersUpdate } from "../../_shared/shopify/api/customers";
import { UpdateCustomerConfigSchema } from "./updateCustomer.schema";
import { resolveShopDomain } from "./_resolveShop";

/**
 * `update_customer` Shopify action handler (Slice 12 Commit 3).
 *
 * PUT `/admin/api/2024-10/customers/{id}.json`. All fields except
 * `customer_id` are optional. Empty fields are omitted from the
 * wire body (the wrapper drops undefineds at the boundary).
 */
export const updateCustomer: ActionHandler = async (input) => {
  const config = UpdateCustomerConfigSchema.parse(input.config);
  const { shopDomain, accountId } = await resolveShopDomain({
    userId: input.userId,
    triggerEvent: input.triggerEvent,
  });

  const customer = await refreshAndRetry({
    userId: input.userId,
    provider: "shopify",
    accountId,
    apiCall: (accessToken) =>
      customersUpdate({
        shopDomain,
        accessToken,
        customerId: config.customer_id,
        email: config.email,
        first_name: config.first_name,
        last_name: config.last_name,
        phone: config.phone,
        tags: config.tags,
        note: config.note,
        accepts_marketing: config.accepts_marketing,
      }),
  });

  return {
    output: {
      success: true,
      customerId: customer.id,
      email: customer.email ?? null,
      adminUrl: `https://${shopDomain}/admin/customers/${customer.id}`,
      updatedAt: customer.updated_at ?? null,
    },
  };
};
