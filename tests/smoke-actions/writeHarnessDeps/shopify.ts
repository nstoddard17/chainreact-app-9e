/**
 * Write smoke harness deps — Shopify smoke read-back seam + staging.
 *
 * Shopify registers NO read actions in V2 (all 11 registered actions are
 * writes), so every write verification goes through this seam's bounded,
 * READ-ONLY per-resource GETs (products / variants / customers / orders /
 * inventory levels). Outputs are sanitized projections of OUR smoke-created
 * resources only — the ids are ledger-captured or staged by this run. The
 * typed NotFoundError maps to found:false; any other error rethrows
 * (context.ts invariant). Every call runs inside `refreshAndRetry`
 * (seam-refresh-guard; Shopify offline tokens are non-refreshable, so this is
 * a no-op on success but keeps the same path as the handlers).
 *
 * Staging (dev-test-only, Gmail/HubSpot seed precedent — each remove() tears
 * down exactly what staging created):
 *   - `discoverShopifyLocation` — the shop's first active location id
 *     (update_inventory's location_id). READ-ONLY.
 *   - `stageShopifyOrderProduct` — a marker-titled 0.00-price product whose
 *     default variant is the order fixtures' line-item target (create_order's
 *     variant_id is strictly numeric, so the id rides the env overlay and the
 *     fixture uses the {{env.*:number}} token). remove() deletes the product.
 *   - `stageShopifyInventoryTarget` — a marker product whose inventory item is
 *     switched to tracked:true and connected at the discovered location
 *     (inventory_levels/set rejects untracked items; V2 registers no action
 *     that enables tracking, so staging owns it). remove() deletes the product.
 */
import { getActiveForExecution } from "@/repositories/integrations";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { shopifyRequest } from "@/integrations/_shared/shopify/api/_request";
import { productsCreate } from "@/integrations/_shared/shopify/api/products";
import { ordersGet } from "@/integrations/_shared/shopify/api/orders";
import { NotFoundError } from "@/integrations/_shared/shopify/errors";
import type { StepRunOutcome } from "../writeHarness";
import type { SmokeReaderContext, SmokeReaderInput } from "./context";

interface ShopContext {
  readonly shopDomain: string;
  readonly providerAccountId: string | null;
  readonly accountId: string;
}

async function resolveShop(ctx: SmokeReaderContext): Promise<ShopContext | null> {
  const integration = await getActiveForExecution(ctx.accountId, "shopify", null);
  if (!integration) return null;
  const shopDomain = String(integration.providerAccountId ?? "");
  if (!shopDomain) return null;
  return { shopDomain, providerAccountId: integration.providerAccountId, accountId: ctx.accountId };
}

const call = <T>(shop: ShopContext, fn: (t: string) => Promise<T>): Promise<T> =>
  refreshAndRetry({
    accountId: shop.accountId,
    provider: "shopify",
    providerAccountId: shop.providerAccountId,
    apiCall: fn,
  });

function idOf(config: Readonly<Record<string, unknown>>, key: string): string {
  const v = config[key];
  if (typeof v === "string" && v.length > 0) return v;
  if (typeof v === "number") return String(v);
  return "";
}

/** Wrap a per-resource GET: typed 404 -> found:false, anything else rethrows. */
async function foundOr404<T extends Record<string, unknown>>(
  read: () => Promise<T>,
  notFound: T,
): Promise<StepRunOutcome> {
  try {
    const output = await read();
    return { ok: true, output, reason: null };
  } catch (err) {
    if (err instanceof NotFoundError) return { ok: true, output: notFound, reason: null };
    throw err;
  }
}

interface ShopifyVariantLite {
  id?: number;
  sku?: string | null;
  price?: string | null;
  option1?: string | null;
  inventory_item_id?: number;
}

export async function shopifySmokeReadBack(
  ctx: SmokeReaderContext,
  input: SmokeReaderInput,
): Promise<StepRunOutcome | null> {
  if (input.provider !== "shopify") return null;
  const shop = await resolveShop(ctx);
  if (!shop) return { ok: false, output: null, reason: "shopify not connected" };

  if (input.action === "product_state") {
    const productId = idOf(input.config, "productId");
    if (!productId) return { ok: false, output: null, reason: "product_state: missing productId" };
    return foundOr404(
      async () => {
        const res = await call(shop, (t) =>
          shopifyRequest<{ product: { title?: string; status?: string; variants?: ShopifyVariantLite[] } }>({
            shopDomain: shop.shopDomain, accessToken: t, method: "GET",
            path: `/products/${encodeURIComponent(productId)}.json`,
            resourceForNotFound: `product ${productId}`,
          }),
        );
        const p = res.product;
        return {
          found: true,
          title: p.title ?? "",
          status: p.status ?? null,
          variants: (p.variants ?? []).map((v) => ({
            id: v.id ?? null, sku: v.sku ?? null, price: v.price ?? null, option1: v.option1 ?? null,
          })),
          variantCount: (p.variants ?? []).length,
        };
      },
      { found: false, title: "", status: null, variants: [], variantCount: 0 },
    );
  }

  if (input.action === "variant_state") {
    const variantId = idOf(input.config, "variantId");
    if (!variantId) return { ok: false, output: null, reason: "variant_state: missing variantId" };
    return foundOr404(
      async () => {
        const res = await call(shop, (t) =>
          shopifyRequest<{ variant: ShopifyVariantLite }>({
            shopDomain: shop.shopDomain, accessToken: t, method: "GET",
            path: `/variants/${encodeURIComponent(variantId)}.json`,
            resourceForNotFound: `variant ${variantId}`,
          }),
        );
        const v = res.variant;
        return {
          found: true, sku: v.sku ?? null, price: v.price ?? null, option1: v.option1 ?? null,
          inventoryItemId: v.inventory_item_id ?? null,
        };
      },
      { found: false, sku: null, price: null, option1: null, inventoryItemId: null },
    );
  }

  if (input.action === "customer_state") {
    const customerId = idOf(input.config, "customerId");
    if (!customerId) return { ok: false, output: null, reason: "customer_state: missing customerId" };
    return foundOr404(
      async () => {
        const res = await call(shop, (t) =>
          shopifyRequest<{ customer: { email?: string | null; first_name?: string | null; tags?: string | null } }>({
            shopDomain: shop.shopDomain, accessToken: t, method: "GET",
            path: `/customers/${encodeURIComponent(customerId)}.json`,
            resourceForNotFound: `customer ${customerId}`,
          }),
        );
        const c = res.customer;
        return { found: true, email: c.email ?? "", firstName: c.first_name ?? "", tags: c.tags ?? "" };
      },
      { found: false, email: "", firstName: "", tags: "" },
    );
  }

  if (input.action === "order_state") {
    const orderId = idOf(input.config, "orderId");
    if (!orderId) return { ok: false, output: null, reason: "order_state: missing orderId" };
    return foundOr404(
      async () => {
        const order = await call(shop, (t) =>
          ordersGet({ shopDomain: shop.shopDomain, accessToken: t, orderId }),
        );
        const o = order as {
          email?: string | null; note?: string | null; tags?: string | null;
          financial_status?: string | null; fulfillment_status?: string | null;
          cancelled_at?: string | null;
        };
        return {
          found: true,
          email: o.email ?? "",
          note: o.note ?? "",
          tags: o.tags ?? "",
          financialStatus: o.financial_status ?? null,
          fulfillmentStatus: o.fulfillment_status ?? null,
          cancelled: o.cancelled_at != null,
        };
      },
      { found: false, email: "", note: "", tags: "", financialStatus: null, fulfillmentStatus: null, cancelled: false },
    );
  }

  if (input.action === "inventory_level") {
    const inventoryItemId = idOf(input.config, "inventoryItemId");
    const locationId = idOf(input.config, "locationId");
    if (!inventoryItemId || !locationId) {
      return { ok: false, output: null, reason: "inventory_level: missing inventoryItemId/locationId" };
    }
    const res = await call(shop, (t) =>
      shopifyRequest<{ inventory_levels: Array<{ available?: number | null }> }>({
        shopDomain: shop.shopDomain, accessToken: t, method: "GET",
        path: `/inventory_levels.json?inventory_item_ids=${encodeURIComponent(inventoryItemId)}&location_ids=${encodeURIComponent(locationId)}`,
        resourceForNotFound: `inventory level ${inventoryItemId}@${locationId}`,
      }),
    );
    const level = res.inventory_levels[0];
    return {
      ok: true,
      output: { found: level !== undefined, available: level?.available ?? null },
      reason: null,
    };
  }

  return null;
}

export interface ShopifyLocation {
  readonly locationId: string;
}

/** First active shop location (update_inventory target). READ-ONLY. */
export async function discoverShopifyLocation(
  accountId: string,
  _userId: string,
): Promise<ShopifyLocation | null> {
  const shop = await resolveShop({ accountId, userId: _userId });
  if (!shop) return null;
  try {
    const res = await call(shop, (t) =>
      shopifyRequest<{ locations: Array<{ id?: number; active?: boolean }> }>({
        shopDomain: shop.shopDomain, accessToken: t, method: "GET",
        path: "/locations.json", resourceForNotFound: "locations",
      }),
    );
    const active = res.locations.find((l) => l.active !== false && l.id !== undefined);
    return active?.id !== undefined ? { locationId: String(active.id) } : null;
  } catch {
    return null;
  }
}

export interface StagedShopifyOrderProduct {
  /** Numeric default-variant id (create_order line_items target). */
  readonly variantId: string;
  /** Delete the staged product (its variant goes with it). */
  readonly remove: () => Promise<void>;
}

/** Stage a marker 0.00-price product whose default variant order fixtures target. */
export async function stageShopifyOrderProduct(
  accountId: string,
  userId: string,
  markerPrefix: string,
): Promise<StagedShopifyOrderProduct | null> {
  const shop = await resolveShop({ accountId, userId });
  if (!shop) return null;
  try {
    const product = await call(shop, (t) =>
      productsCreate({
        shopDomain: shop.shopDomain, accessToken: t,
        title: `${markerPrefix}orderproduct - safe to delete`,
        price: "0.00", product_type: "crsmoke",
      }),
    );
    const p = product as { id?: number; variants?: Array<{ id?: number }> };
    const variantId = p.variants?.[0]?.id;
    if (p.id === undefined || variantId === undefined) return null;
    const productId = p.id;
    return {
      variantId: String(variantId),
      remove: async () => {
        await call(shop, (t) =>
          shopifyRequest<Record<string, never>>({
            shopDomain: shop.shopDomain, accessToken: t, method: "DELETE",
            path: `/products/${productId}.json`, resourceForNotFound: `product ${productId}`,
          }),
        ).catch(() => {});
      },
    };
  } catch {
    return null;
  }
}

export interface StagedShopifyInventoryTarget {
  readonly inventoryItemId: string;
  readonly remove: () => Promise<void>;
}

/**
 * Stage a marker product whose inventory item is TRACKED and connected at
 * `locationId` (inventory_levels/set rejects untracked/unconnected items; V2
 * registers no tracking-enable action, so staging owns both switches).
 */
export async function stageShopifyInventoryTarget(
  accountId: string,
  userId: string,
  markerPrefix: string,
  locationId: string,
): Promise<StagedShopifyInventoryTarget | null> {
  const shop = await resolveShop({ accountId, userId });
  if (!shop) return null;
  try {
    const product = await call(shop, (t) =>
      productsCreate({
        shopDomain: shop.shopDomain, accessToken: t,
        title: `${markerPrefix}invproduct - safe to delete`,
        price: "0.00", product_type: "crsmoke", sku: `${markerPrefix}inv`,
      }),
    );
    const p = product as { id?: number; variants?: Array<{ id?: number; inventory_item_id?: number }> };
    const inventoryItemId = p.variants?.[0]?.inventory_item_id;
    if (p.id === undefined || inventoryItemId === undefined) return null;
    const productId = p.id;
    await call(shop, (t) =>
      shopifyRequest<{ inventory_item: unknown }>({
        shopDomain: shop.shopDomain, accessToken: t, method: "PUT",
        path: `/inventory_items/${inventoryItemId}.json`,
        body: { inventory_item: { id: inventoryItemId, tracked: true } },
        resourceForNotFound: `inventory item ${inventoryItemId}`,
      }),
    );
    await call(shop, (t) =>
      shopifyRequest<{ inventory_level: unknown }>({
        shopDomain: shop.shopDomain, accessToken: t, method: "POST",
        path: "/inventory_levels/connect.json",
        body: { inventory_item_id: inventoryItemId, location_id: Number(locationId) },
        resourceForNotFound: `inventory connect ${inventoryItemId}`,
      }),
    );
    return {
      inventoryItemId: String(inventoryItemId),
      remove: async () => {
        await call(shop, (t) =>
          shopifyRequest<Record<string, never>>({
            shopDomain: shop.shopDomain, accessToken: t, method: "DELETE",
            path: `/products/${productId}.json`, resourceForNotFound: `product ${productId}`,
          }),
        ).catch(() => {});
      },
    };
  } catch {
    return null;
  }
}
