import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { customersCreate } from "../../_shared/shopify/api/customers";
import { CreateCustomerConfigSchema } from "./createCustomer.schema";
import { resolveShopDomain } from "./_resolveShop";

/**
 * `create_customer` Shopify action handler (Slice 12 Commit 3).
 *
 * POST `/admin/api/2024-10/customers.json`. The schema-side
 * `send_welcome_email` boolean (Q11 consent gate) maps to Shopify's
 * `customer.send_email_welcome` REST field at the wrapper boundary.
 */
export const createCustomer: ActionHandler = async (input) => {
  const config = CreateCustomerConfigSchema.parse(input.config);
  const { shopDomain, providerAccountId } = await resolveShopDomain({
    accountId: input.accountId,
    userId: input.userId,
    triggerEvent: input.triggerEvent,
  });

  const customer = await refreshAndRetry({
    accountId: input.accountId,
    provider: "shopify",
    providerAccountId,
    apiCall: (accessToken) =>
      customersCreate({
        shopDomain,
        accessToken,
        email: config.email,
        // Q11 consent gate — the schema's `send_welcome_email`
        // becomes Shopify's `send_email_welcome` field.
        send_email_welcome: config.send_welcome_email,
        first_name: config.first_name,
        last_name: config.last_name,
        phone: config.phone,
        tags: config.tags,
      }),
  });

  return {
    output: {
      customerId: customer.id,
      email: customer.email ?? null,
      firstName: customer.first_name ?? null,
      lastName: customer.last_name ?? null,
      adminUrl: `https://${shopDomain}/admin/customers/${customer.id}`,
      createdAt: customer.created_at ?? null,
    },
  };
};
