import { shopifyRequest } from "./_request";

/**
 * Shopify Admin REST `/locations` resource wrapper — RESOLVERS-2.
 *
 * READ-ONLY. The only consumer is the `shopify:locations` options
 * resolver, which backs the `location_id` picker on
 * `shopify:update_inventory`.
 *
 * SCOPE: `read_locations`, added to the manifest's **OPTIONAL** scopes
 * in RESOLVERS-2. It is optional, not required, on purpose: no ACTION
 * handler needs it (`update_inventory` only WRITES against a location
 * id it is given), so promoting it to required would force every
 * already-connected Shopify store to reconnect for a picker. Tokens
 * minted before the add get HTTP 403 → `InsufficientScopeError` (mapped
 * in `_request.ts`) → the resolver's `PROVIDER_REAUTH_REQUIRED`
 * (Reconnect prompt). Manual entry keeps the field usable meanwhile.
 *
 * Docs: https://shopify.dev/docs/api/admin-rest/2024-10/resources/location#get-locations
 */

/** Defensive client-side cap. Shops have a handful of locations; `hasMore` stays honest above it. */
export const LOCATIONS_CAP = 250;

/**
 * Normalized location option — only what a picker label needs.
 *
 * PRIVACY BOUNDARY: `city` + `provinceCode` only. Shopify's location
 * resource also carries `address1` / `address2` / `zip` / `phone`;
 * they are dropped HERE so a street address can never reach an option
 * label or the browser.
 */
export interface LocationOption {
  /** Numeric location id (Shopify REST id). */
  id: number;
  /** Location name, e.g. "Warehouse". Empty when omitted. */
  name: string;
  /** City / locality, e.g. "Brooklyn". Empty when omitted. */
  city: string;
  /** Province / state code, e.g. "NY". Empty when omitted. */
  provinceCode: string;
  /** False when Shopify marks the location inactive. */
  active: boolean;
}

interface ShopifyLocationsListResponse {
  locations?: Array<{
    id?: number;
    name?: string;
    city?: string | null;
    province_code?: string | null;
    province?: string | null;
    active?: boolean;
  }>;
}

export interface LocationsListInput {
  shopDomain: string;
  accessToken: string;
}

export interface LocationsListResult {
  locations: LocationOption[];
  /** True when Shopify returned more than {@link LOCATIONS_CAP} locations. */
  truncated: boolean;
}

/**
 * List the shop's locations, normalized to {@link LocationOption}.
 *
 * `GET /locations.json` takes no documented list params — Shopify
 * returns the shop's locations in one response — so the bound is
 * applied client-side at {@link LOCATIONS_CAP} and reported honestly.
 *
 * Throws `InsufficientScopeError` (via `_request.ts`) when the token
 * predates the `read_locations` scope add.
 */
export async function locationsList(
  input: LocationsListInput,
): Promise<LocationsListResult> {
  const response = await shopifyRequest<ShopifyLocationsListResponse>({
    shopDomain: input.shopDomain,
    accessToken: input.accessToken,
    method: "GET",
    path: "/locations.json",
    resourceForNotFound: "locations (list)",
  });

  const raw = response.locations ?? [];
  const locations: LocationOption[] = [];
  for (const l of raw.slice(0, LOCATIONS_CAP)) {
    if (!l || typeof l.id !== "number") continue;
    // `province_code` ("NY") is preferred over `province` ("New York")
    // for a compact label; fall back when Shopify omits the code.
    const provinceCode =
      typeof l.province_code === "string" && l.province_code.length > 0
        ? l.province_code
        : typeof l.province === "string"
          ? l.province
          : "";
    locations.push({
      id: l.id,
      name: typeof l.name === "string" ? l.name : "",
      city: typeof l.city === "string" ? l.city : "",
      provinceCode,
      active: l.active !== false,
    });
  }
  return { locations, truncated: raw.length > LOCATIONS_CAP };
}
