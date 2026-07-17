import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { locationsList } from "@/integrations/_shared/shopify/api/locations";
import type { OptionItem, OptionsResolver } from "@/services/options/types";
import {
  filterAndSortByLabel,
  mapShopifyOptionsError,
  requireShopifyIntegration,
} from "./_shared";

/**
 * `shopify:locations` options resolver — RESOLVERS-2.
 *
 * Backs the `location_id` picker on `shopify:update_inventory`
 * (combobox + manual entry — a location id mapped from an upstream step
 * via `{{...}}` keeps working unchanged). Account-scoped, no deps.
 *
 * Endpoint: `GET /admin/api/2024-10/locations.json` via `locationsList`.
 * Docs: https://shopify.dev/docs/api/admin-rest/2024-10/resources/location#get-locations
 *
 * **SCOPE / RECONNECT — the one thing that makes this resolver
 * different from `shopify:products` / `shopify:orders`:**
 * `read_locations` is NOT in the manifest's required scope set (no
 * action handler needs it — `update_inventory` only writes against a
 * location id it is handed). RESOLVERS-2 adds it to the manifest's
 * **OPTIONAL** scopes, following the `MailboxSettings.Read` precedent on
 * `microsoft-outlook`: required would force every existing Shopify
 * connection to reconnect just to gain a picker. Consequence: every
 * token minted before this change lacks `read_locations` and gets HTTP
 * 403 → `InsufficientScopeError` (mapped in `_shared/shopify/api/_request.ts`)
 * → `PROVIDER_REAUTH_REQUIRED` here, which renders as a Reconnect prompt
 * rather than a silently broken empty box. Reconnecting re-runs the
 * install with the widened scope; manual entry keeps the field usable
 * meanwhile. Shopify is non-refreshable, so a refresh could never have
 * granted it either.
 *
 * `value` = the numeric location id as a string (the schema accepts
 * `string | number`; the string form round-trips unchanged).
 *
 * `label` = business-recognizable, id-free: `Warehouse - Brooklyn, NY`
 * (name + city/locality). A location with no city reads `Warehouse`.
 * Inactive locations surface an "Inactive" `description` hint —
 * `update_inventory` against one will fail at Shopify, so the author
 * should see it before picking; the id itself is not surfaced in the
 * label. PRIVACY: `locationsList` drops street address / zip / phone at
 * the wrapper boundary — only city + province code are ever read.
 *
 * Local `ctx.q` filtering + alpha sort (Shopify's locations endpoint
 * takes no search or paging params). `hasMore` from the wrapper's
 * client-side cap — false for any realistic shop.
 *
 * The shop is pinned by the integration row (`providerAccountId` IS the
 * `*.myshopify.com` domain) — config can never override it.
 */
export const shopifyLocationsResolver: OptionsResolver = {
  source: "shopify:locations",
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
          locationsList({
            shopDomain: integration.providerAccountId,
            accessToken,
          }),
      });
    } catch (err) {
      mapShopifyOptionsError(err, "locations");
    }

    const items: OptionItem[] = result.locations.map((l) => {
      const value = String(l.id);
      const place = [l.city, l.provinceCode]
        .filter((part) => part.length > 0)
        .join(", ");
      const name = l.name.length > 0 ? l.name : value;
      const label = place.length > 0 ? `${name} - ${place}` : name;
      return l.active ? { value, label } : { value, label, description: "Inactive" };
    });

    return {
      items: filterAndSortByLabel(items, ctx.q),
      hasMore: result.truncated,
    };
  },
};
