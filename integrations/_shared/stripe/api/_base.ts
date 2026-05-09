/**
 * Shared Stripe REST API base — URL + pinned API version.
 *
 * Mirrors `_shared/airtable/api/_base.ts` and `_shared/notion/api/_base.ts`
 * shape. The base URL is env-overridable for e2e (Slice 11 Commit 5
 * mock server); production never sets the override and the default
 * points at real Stripe.
 *
 * The Stripe API version pin matches `integrations/stripe/manifest.ts`
 * — both reference this const so the wire-format surface area stays
 * coherent. Bumping the version is a single-line edit here + manifest
 * sync.
 */
export function stripeApiBase(): string {
  return process.env.STRIPE_API_BASE ?? "https://api.stripe.com";
}

/**
 * Pinned Stripe API version. Matches V1's `lib/stripe/client.ts:15`
 * pin so the wire-format surface area is identical between V1 and V2
 * during the cutover.
 *
 * Sent as the `Stripe-Version` header on every REST call. Stripe's
 * API is versioned per-account in the dashboard but the header
 * override is per-request — pinning here insulates V2 from
 * dashboard-level version bumps.
 */
export const STRIPE_API_VERSION = "2025-05-28.basil";
