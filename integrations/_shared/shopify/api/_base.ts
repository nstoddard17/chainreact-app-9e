/**
 * Shopify Admin API base — pinned version + per-shop URL builder.
 *
 * Slice 12 Commit 3. The pinned API version mirrors
 * `integrations/shopify/manifest.ts`'s `apiVersion` field — kept in
 * lockstep so the manifest, OAuth's auxiliary `/shop.json` call (Slice
 * 12 Commit 2), and the action wrappers all hit the same versioned
 * surface. A future API-version bump touches this file + the manifest;
 * action handlers don't reference the version directly.
 *
 * Per-shop URL routing is the distinguishing feature for Shopify vs
 * every other V2 provider (Stripe / Notion / Microsoft / Google all
 * have a static API base). The shop domain comes from the integration
 * row's `providerAccountId` — never from action config — per Slice
 * 12 Commit 2's `accountIdField: "shopDomain"` contract.
 */

export const SHOPIFY_API_VERSION = "2024-10";

/**
 * Resolve the per-shop origin Shopify Admin calls should target.
 *
 * Production: `https://{shop}` — the merchant's own *.myshopify.com host.
 *
 * Test override: when `SHOPIFY_API_BASE_OVERRIDE` is set (e2e dev server
 * via `playwright.config.ts`), returns `${override}/{shop}`. The shop
 * domain stays embedded in the URL path so the mock can route by
 * extracting the first segment — preserves V2's per-shop routing
 * contract end-to-end while letting all `https://{shop}/...` calls land
 * on a single localhost mock. Slice 12 Commit 5.
 */
export function shopifyOriginFor(shopDomain: string): string {
  const override = process.env.SHOPIFY_API_BASE_OVERRIDE?.trim();
  if (override) {
    return `${override.replace(/\/$/, "")}/${shopDomain}`;
  }
  return `https://${shopDomain}`;
}

/**
 * Build the API base URL for a specific shop.
 *
 * @param shopDomain Full `*.myshopify.com` host, exactly as stored on
 *   `integrations.providerAccountId`. The OAuth callback validated the
 *   format at connect time (Slice 12 Commit 2), so this helper trusts
 *   its input — no re-validation. Wrappers MUST source this value
 *   from `getActiveForExecution(...).providerAccountId`, never from
 *   user-supplied action config.
 */
export function shopifyApiBase(shopDomain: string): string {
  return `${shopifyOriginFor(shopDomain)}/admin/api/${SHOPIFY_API_VERSION}`;
}
