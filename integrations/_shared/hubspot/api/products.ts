import { crmPath, hubspotRequest } from "./_request";

/**
 * HubSpot CRM v3 `products` resource wrappers — Slice 13 Commit 4.
 *
 * Endpoints:
 *   - POST  /crm/v3/objects/products                     (create)
 *   - PATCH /crm/v3/objects/products/{id}                (update)
 *
 * Required property at the schema layer: `name` (V1 enforces; HubSpot
 * accepts empty but enforces at the schema gives clean fail-fast
 * behavior).
 */

export interface HubSpotProduct {
  id: string;
  properties: Record<string, string | null>;
  createdAt?: string;
  updatedAt?: string;
  archived?: boolean;
}

export interface ProductsCreateInput {
  accessToken: string;
  properties: Record<string, string>;
}

export async function productsCreate(
  input: ProductsCreateInput,
): Promise<HubSpotProduct> {
  return hubspotRequest<HubSpotProduct>({
    accessToken: input.accessToken,
    method: "POST",
    path: crmPath("objects/products"),
    body: { properties: input.properties },
    resourceForNotFound: "product (create)",
  });
}

export interface ProductsUpdateInput {
  accessToken: string;
  productId: string;
  properties: Record<string, string>;
}

export async function productsUpdate(
  input: ProductsUpdateInput,
): Promise<HubSpotProduct> {
  return hubspotRequest<HubSpotProduct>({
    accessToken: input.accessToken,
    method: "PATCH",
    path: crmPath(`objects/products/${encodeURIComponent(input.productId)}`),
    body: { properties: input.properties },
    resourceForNotFound: `product ${input.productId}`,
  });
}
