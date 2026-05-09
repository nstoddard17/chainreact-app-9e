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
  return `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}`;
}
