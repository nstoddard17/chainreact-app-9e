import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { productVariantsList } from "@/integrations/_shared/shopify/api/products";
import type { OptionItem, OptionsResolver } from "@/services/options/types";
import {
  filterAndSortByLabel,
  mapShopifyOptionsError,
  requireShopifyIntegration,
} from "./_shared";

/**
 * `shopify:variants` options resolver — RESOLVERS-2.
 *
 * Backs the `variant_id` picker on `shopify:update_product_variant`
 * (combobox + manual entry — a variant id mapped from an upstream step
 * via `{{...}}` keeps working unchanged).
 *
 * **FLAT, NO PARENT DEP — deliberate.** `update_product_variant`'s
 * runtime schema (`updateProductVariant.schema.ts`) is `.strict()` and
 * has NO sibling product field, so there is nothing to `dependsOn`, and
 * inventing one would mean adding a runtime schema field purely to
 * shape the UI (out of scope, and it would change the action's config
 * contract). The flat picker is viable because Shopify's REST products
 * list can return each product's variants inline
 * (`fields=id,title,variants`) — one bounded call yields every variant
 * with its product context. The label is product-qualified so a flat
 * list is still readable:
 *
 *   `Acme Tee - Small / Blue - SKU ABC-1 - 19.00`
 *
 * Missing parts drop out cleanly, so a single-variant product with no
 * SKU reads `Acme Mug - Default Title - 12.00`. The numeric id rides in
 * `description` only.
 *
 * NOTE on price: `GET /products.json` returns variant `price` as a bare
 * decimal string with NO per-variant currency (the shop has exactly one
 * currency, which this endpoint doesn't echo). Rather than fetch
 * `/shop.json` purely to decorate a label, or guess a symbol, the price
 * is rendered bare — the merchant knows their own shop currency.
 *
 * Endpoint: `GET /admin/api/2024-10/products.json?limit=100&fields=id,title,variants`
 * via `productVariantsList` (`read_products` scope, already required in
 * the manifest — no scope change, no reconnect). Shopify has no
 * shop-wide `/variants.json` list endpoint; see the wrapper's docblock.
 * Docs: https://shopify.dev/docs/api/admin-rest/2024-10/resources/product#get-products
 *
 * `value` = the numeric variant id as a string (the schema accepts
 * `string | number`; the string form round-trips unchanged).
 *
 * Local `ctx.q` filtering (Shopify's REST product list has no search
 * param — product search is GraphQL-only) + alpha sort by label, which
 * groups a product's variants together. `hasMore` is honest: it's true
 * when a full page of PRODUCTS came back, i.e. variants of later
 * products aren't listed — refine with search or map/paste the id.
 *
 * The shop is pinned by the integration row (`providerAccountId` IS the
 * `*.myshopify.com` domain) — config can never override it.
 */
export const shopifyVariantsResolver: OptionsResolver = {
  source: "shopify:variants",
  provider: "shopify",
  requiresIntegration: true,
  async resolve(ctx) {
    const integration = requireShopifyIntegration(ctx);

    let result;
    try {
      result = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "shopify",
        providerAccountId: integration.providerAccountId,
        apiCall: (accessToken) =>
          productVariantsList({
            shopDomain: integration.providerAccountId,
            accessToken,
          }),
      });
    } catch (err) {
      mapShopifyOptionsError(err, "product variants");
    }

    const items: OptionItem[] = result.variants.map((v) => {
      const value = String(v.id);
      const label = [
        v.productTitle,
        v.variantTitle,
        v.sku.length > 0 ? `SKU ${v.sku}` : "",
        v.price,
      ]
        .filter((part) => part.length > 0)
        .join(" - ");
      return {
        value,
        label: label.length > 0 ? label : value,
        description: value,
      };
    });

    return {
      items: filterAndSortByLabel(items, ctx.q),
      hasMore: result.truncated,
    };
  },
};
