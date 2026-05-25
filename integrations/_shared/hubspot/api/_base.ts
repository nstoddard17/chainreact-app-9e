/**
 * Shared HubSpot REST API base — URL + pinned API version.
 *
 * Slice 13 Commit 3. Mirrors `_shared/stripe/api/_base.ts`,
 * `_shared/airtable/api/_base.ts`, and the Shopify pattern.
 *
 * The base URL is env-overridable for e2e (Slice 13 Commit 6 mock
 * server); production never sets the override and the default points
 * at real HubSpot. The same override applies to every HubSpot wire
 * call — OAuth token exchange (Commit 2), account-info resolution
 * (Commit 2), CRM REST (this commit), and the future webhook
 * subscription management endpoints (Commit 5).
 *
 * The HubSpot CRM API version pin matches `integrations/hubspot/manifest.ts`
 * — both reference `v3` so the wire-format surface area stays coherent.
 * Bumping the version is a single-line edit here + manifest sync.
 */
export function hubspotApiBase(): string {
  return process.env.HUBSPOT_API_BASE ?? "https://api.hubapi.com";
}

/**
 * Pinned HubSpot CRM API version. Matches V1's per-handler usage
 * across `lib/workflows/actions/hubspot/*.ts` (all hit `/crm/v3/...`).
 * Sent as a path segment, not a header — HubSpot's CRM API is
 * URL-versioned.
 */
export const HUBSPOT_CRM_VERSION = "v3";
