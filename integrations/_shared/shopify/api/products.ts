import { shopifyRequest } from "./_request";

/**
 * Shopify Admin REST `/products` + `/variants` resource wrappers.
 *
 * Slice 12 Commit 3. Covers `create_product`, `update_product`, and
 * `create_product_variant`. The `update_product_variant` action is
 * deferred per Slice 12 plan §"In-scope action list" — `update_product`
 * covers the most common variant update flows.
 */

// ─── Wire-format response types ─────────────────────────────────────────────

export interface ShopifyProductVariant {
  id: number;
  product_id: number;
  title?: string;
  sku?: string | null;
  price?: string;
  position?: number;
  inventory_quantity?: number;
  weight?: number;
  barcode?: string | null;
  option1?: string | null;
  option2?: string | null;
  option3?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ShopifyProduct {
  id: number;
  title?: string;
  body_html?: string | null;
  vendor?: string;
  product_type?: string;
  tags?: string;
  status?: string;
  variants?: ShopifyProductVariant[];
  published_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

interface ShopifyProductResponse {
  product: ShopifyProduct;
}

interface ShopifyVariantResponse {
  variant: ShopifyProductVariant;
}

// ─── productsCreate ─────────────────────────────────────────────────────────

export interface ProductsCreateInput {
  shopDomain: string;
  accessToken: string;
  title: string;
  body_html?: string;
  vendor?: string;
  product_type?: string;
  /** Default-variant price, in the shop's currency. */
  price: string;
  sku?: string;
  inventory_quantity?: number;
}

export async function productsCreate(
  input: ProductsCreateInput,
): Promise<ShopifyProduct> {
  const product: Record<string, unknown> = { title: input.title };
  if (input.body_html !== undefined) product.body_html = input.body_html;
  if (input.vendor !== undefined) product.vendor = input.vendor;
  if (input.product_type !== undefined) product.product_type = input.product_type;

  // Default variant — Shopify creates one automatically when none is
  // supplied, but we surface price + sku + initial inventory through
  // it so the create call returns the expected `variants[0].id`.
  const defaultVariant: Record<string, unknown> = { price: input.price };
  if (input.sku !== undefined) defaultVariant.sku = input.sku;
  if (input.inventory_quantity !== undefined) {
    defaultVariant.inventory_quantity = input.inventory_quantity;
  }
  product.variants = [defaultVariant];

  const response = await shopifyRequest<ShopifyProductResponse>({
    shopDomain: input.shopDomain,
    accessToken: input.accessToken,
    method: "POST",
    path: "/products.json",
    body: { product },
    resourceForNotFound: "product (create)",
  });
  return response.product;
}

// ─── productsUpdate ─────────────────────────────────────────────────────────

export interface ProductsUpdateInput {
  shopDomain: string;
  accessToken: string;
  productId: string | number;
  title?: string;
  body_html?: string;
  vendor?: string;
  product_type?: string;
  tags?: string;
  /**
   * Optional published toggle. Mapped to Shopify's `status: "active" |
   * "draft"` field — the modern equivalent of the legacy `published`
   * boolean on REST. Slice 12 plan accepts the V1 select-field shape
   * ("Keep Current" / "true" / "false") at the schema layer; the
   * handler converts to `status` here.
   */
  published?: boolean;
}

export async function productsUpdate(
  input: ProductsUpdateInput,
): Promise<ShopifyProduct> {
  const product: Record<string, unknown> = { id: Number(input.productId) };
  if (input.title !== undefined) product.title = input.title;
  if (input.body_html !== undefined) product.body_html = input.body_html;
  if (input.vendor !== undefined) product.vendor = input.vendor;
  if (input.product_type !== undefined) product.product_type = input.product_type;
  if (input.tags !== undefined) product.tags = input.tags;
  if (input.published !== undefined) {
    product.status = input.published ? "active" : "draft";
  }

  const response = await shopifyRequest<ShopifyProductResponse>({
    shopDomain: input.shopDomain,
    accessToken: input.accessToken,
    method: "PUT",
    path: `/products/${encodeURIComponent(String(input.productId))}.json`,
    body: { product },
    resourceForNotFound: `product ${input.productId}`,
  });
  return response.product;
}

// ─── variantsCreate ─────────────────────────────────────────────────────────

export interface VariantsCreateInput {
  shopDomain: string;
  accessToken: string;
  productId: string | number;
  /** Price for the new variant (shop's currency). */
  price: string;
  option1?: string;
  option2?: string;
  option3?: string;
  sku?: string;
  inventory_quantity?: number;
  weight?: number;
  barcode?: string;
}

export async function variantsCreate(
  input: VariantsCreateInput,
): Promise<ShopifyProductVariant> {
  const variant: Record<string, unknown> = { price: input.price };
  if (input.option1 !== undefined) variant.option1 = input.option1;
  if (input.option2 !== undefined) variant.option2 = input.option2;
  if (input.option3 !== undefined) variant.option3 = input.option3;
  if (input.sku !== undefined) variant.sku = input.sku;
  if (input.inventory_quantity !== undefined) {
    variant.inventory_quantity = input.inventory_quantity;
  }
  if (input.weight !== undefined) variant.weight = input.weight;
  if (input.barcode !== undefined) variant.barcode = input.barcode;

  const response = await shopifyRequest<ShopifyVariantResponse>({
    shopDomain: input.shopDomain,
    accessToken: input.accessToken,
    method: "POST",
    path: `/products/${encodeURIComponent(String(input.productId))}/variants.json`,
    body: { variant },
    resourceForNotFound: `product ${input.productId} (variant create)`,
  });
  return response.variant;
}
