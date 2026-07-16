import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { productsList } from "@/integrations/_shared/shopify/api/products";
import type { OptionItem, OptionsResolver } from "@/services/options/types";
import {
  filterAndSortByLabel,
  mapShopifyOptionsError,
  requireShopifyIntegration,
} from "./_shared";

/**
 * `shopify:products` options resolver — RESOLVERS-1.
 *
 * Backs the `product_id` pickers on `shopify:update_product` and
 * `shopify:create_product_variant`. Account-scoped, no deps.
 *
 * Endpoint: `GET /admin/api/2024-10/products.json?limit=100&fields=id,title,status`
 * (one bounded page; `read_products` scope, already granted).
 * Docs: https://shopify.dev/docs/api/admin-rest/2024-10/resources/product#get-products
 *
 * Behavior:
 *   - The shop is the integration row (`providerAccountId` = shop
 *     domain) — the same "action config can never override the shop"
 *     contract the handlers follow. Auth via `refreshAndRetry` exactly
 *     like the action handlers (401 → reconnect).
 *   - `value` = the numeric product id as a string (the handler
 *     schemas accept `string | number`; the string form round-trips
 *     through the combobox and `{{...}}` wiring unchanged).
 *   - `label` = product title only (id fallback); non-active status
 *     surfaces as a "Draft" / "Archived" description hint. No prices,
 *     variants, or inventory ever reach the browser.
 *   - Local `ctx.q` filtering + alpha sort; `hasMore` honest from the
 *     wrapper's `truncated` flag (manual id entry stays available for
 *     catalogs beyond the cap).
 */
export const shopifyProductsResolver: OptionsResolver = {
  source: "shopify:products",
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
          productsList({
            shopDomain: integration.providerAccountId,
            accessToken,
          }),
      });
    } catch (err) {
      mapShopifyOptionsError(err, "products");
    }

    const items: OptionItem[] = result.products.map((p) => {
      const value = String(p.id);
      const label = p.title.length > 0 ? p.title : value;
      if (p.status === "draft" || p.status === "archived") {
        return {
          value,
          label,
          description: p.status === "draft" ? "Draft" : "Archived",
        };
      }
      return { value, label };
    });

    return {
      items: filterAndSortByLabel(items, ctx.q),
      hasMore: result.truncated,
    };
  },
};
