import { shopifyRequest } from "./_request";

/**
 * Shopify Admin REST `/products` + `/variants` resource wrappers.
 *
 * Slice 12 Commit 3 — `create_product`, `update_product`,
 * `create_product_variant`.
 * Shopify 2.1 Commit 1 — `variantsUpdate` (the only parity gap left
 * after Slice 12 per [`docs/slices/parity-shopify.md`](../../../docs/slices/parity-shopify.md) §5).
 * RESOLVERS-1 — `productsList` (read-only, one bounded page; backs the
 * `shopify:products` options resolver).
 */

// ─── Wire-format response types ─────────────────────────────────────────────

export interface ShopifyProductVariant {
  id: number;
  product_id: number;
  title?: string;
  sku?: string | null;
  price?: string;
  compare_at_price?: string | null;
  position?: number;
  inventory_quantity?: number;
  inventory_item_id?: number;
  weight?: number;
  weight_unit?: string;
  taxable?: boolean;
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

// ─── productsList ───────────────────────────────────────────────────────────

/** One page is 100 (Shopify allows up to 250; 100 matches the V2 resolver posture). */
export const PRODUCTS_PAGE_SIZE = 100;

/** Normalized product option — only the fields a picker needs; no raw payload. */
export interface ProductOption {
  /** Numeric product id (Shopify REST id). */
  id: number;
  title: string;
  /** `active` / `draft` / `archived`. */
  status: string;
}

interface ShopifyProductsListResponse {
  products: Array<{ id?: number; title?: string; status?: string }>;
}

export interface ProductsListInput {
  shopDomain: string;
  accessToken: string;
}

export interface ProductsListResult {
  products: ProductOption[];
  /** True when a full page came back — more products may exist. */
  truncated: boolean;
}

/**
 * List the shop's products, normalized to `{ id, title, status }`.
 * READ-ONLY (`GET /products.json?limit=100&fields=id,title,status`) on the
 * already-granted `read_products` scope. BOUNDED: one page of
 * {@link PRODUCTS_PAGE_SIZE}; callers keep a manual product-id entry path
 * for catalogs beyond the cap (cursor pagination via the `Link` header is
 * intentionally not followed). Only id/title/status are requested — no
 * variants, prices, or inventory ever cross this boundary.
 *
 * Docs: https://shopify.dev/docs/api/admin-rest/2024-10/resources/product#get-products
 */
export async function productsList(
  input: ProductsListInput,
): Promise<ProductsListResult> {
  const query = new URLSearchParams({
    limit: String(PRODUCTS_PAGE_SIZE),
    fields: "id,title,status",
  });
  const response = await shopifyRequest<ShopifyProductsListResponse>({
    shopDomain: input.shopDomain,
    accessToken: input.accessToken,
    method: "GET",
    path: "/products.json",
    query,
    resourceForNotFound: "products",
  });

  const products: ProductOption[] = [];
  for (const p of response.products ?? []) {
    if (p && typeof p.id === "number") {
      products.push({
        id: p.id,
        title: typeof p.title === "string" ? p.title : "",
        status: typeof p.status === "string" ? p.status : "",
      });
    }
  }
  return { products, truncated: products.length === PRODUCTS_PAGE_SIZE };
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

// ─── variantsUpdate (Shopify 2.1 Commit 1) ──────────────────────────────────

export interface VariantsUpdateInput {
  shopDomain: string;
  accessToken: string;
  /** Variant id — string or numeric; URL-encoded into the path. */
  variantId: string | number;
  /** Decimal-as-string ("44.99"). */
  price?: string;
  compare_at_price?: string;
  sku?: string;
  barcode?: string;
  option1?: string;
  option2?: string;
  option3?: string;
  /** Weight value in `weight_unit` units. */
  weight?: number;
  /** Shopify-supported weight units. */
  weight_unit?: "g" | "kg" | "oz" | "lb";
  taxable?: boolean;
}

/**
 * REST PUT `/admin/api/2024-10/variants/{variantId}.json` with
 * `body.variant = { id, ...fields }`. Only fields explicitly present
 * on the input are sent on the wire — Shopify's PATCH-style PUT
 * preserves all other variant fields untouched.
 *
 * Inventory fields (`inventory_quantity`, `inventory_item_id`,
 * `inventory_management`) are intentionally NOT exposed on this
 * wrapper — variant inventory changes go through the dedicated
 * `update_inventory` action (Shopify 2.1 Commit 1 scope decision,
 * mirroring V1's own boundary at
 * [`updateProductVariant.ts:78-85`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/shopify/updateProductVariant.ts)).
 *
 * URL-encodes `variantId` so non-numeric ids (Shopify accepts string
 * ids in some legacy code paths) survive cleanly.
 */
export async function variantsUpdate(
  input: VariantsUpdateInput,
): Promise<ShopifyProductVariant> {
  // Defensive field selection — only documented keys are pulled from
  // the input; extras on caller-supplied objects cannot smuggle to
  // the wire request.
  const variant: Record<string, unknown> = { id: Number(input.variantId) };
  if (input.price !== undefined) variant.price = input.price;
  if (input.compare_at_price !== undefined) {
    variant.compare_at_price = input.compare_at_price;
  }
  if (input.sku !== undefined) variant.sku = input.sku;
  if (input.barcode !== undefined) variant.barcode = input.barcode;
  if (input.option1 !== undefined) variant.option1 = input.option1;
  if (input.option2 !== undefined) variant.option2 = input.option2;
  if (input.option3 !== undefined) variant.option3 = input.option3;
  if (input.weight !== undefined) variant.weight = input.weight;
  if (input.weight_unit !== undefined) variant.weight_unit = input.weight_unit;
  if (input.taxable !== undefined) variant.taxable = input.taxable;

  const response = await shopifyRequest<ShopifyVariantResponse>({
    shopDomain: input.shopDomain,
    accessToken: input.accessToken,
    method: "PUT",
    path: `/variants/${encodeURIComponent(String(input.variantId))}.json`,
    body: { variant },
    resourceForNotFound: `variant ${input.variantId}`,
  });
  return response.variant;
}
