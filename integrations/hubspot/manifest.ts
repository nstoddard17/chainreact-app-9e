import {
  ProviderManifestSchema,
  type ProviderManifest,
} from "@/contracts/integration";

/**
 * HubSpot provider manifest.
 *
 * Slice 13 — V2's first CRM provider AND first app-level webhook
 * subscription model with portal-scoped reference counting. See
 * `docs/slices/slice-13-hubspot.md`.
 *
 * Capability flags follow the V2 honest-state convention. Slice 13
 * Commit 2 (this) lands manifest + OAuth + dispatcher registration —
 * `oauth: true`, the rest `false`. Subsequent commits flip `actions`
 * (Commits 3 + 4) and `webhookTrigger` (Commit 5).
 *
 * Token model — refreshable with NON-rotated refresh tokens:
 *   HubSpot's OAuth flow issues both an access token (~6h TTL) and a
 *   refresh token. Per current HubSpot docs, the refresh_token is NOT
 *   rotated by default — the same value is reusable indefinitely.
 *   HubSpot's token endpoint MAY occasionally include a fresh
 *   refresh_token in the response (defense-in-depth rotation); when
 *   present, V2 persists the new value, when absent, V2 preserves the
 *   original. Mirrors V2's Stripe Connect behavior (Slice 11) and
 *   contrasts with Airtable's mandatory rotation (Slice 10).
 *
 *   V1's [`oauthConfig.ts:395`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/oauthConfig.ts#L395)
 *   `refreshTokenExpirationSupported: false` means "the refresh token
 *   itself doesn't carry an explicit expiration metadata field," NOT
 *   "refresh isn't supported." V2's manifest uses `refreshable: true`.
 *
 * `tokenScope: "user"` — one HubSpot integration per (user, hubId).
 * Each authorize flow grants tokens scoped to a specific portal
 * (`hub_id`); reauthorizing against a different portal creates a
 * sibling integration row.
 *
 * `accountIdField: "hubId"` — HubSpot's
 * [`/oauth/v1/access-tokens/{token}`](https://developers.hubspot.com/docs/api/oauth/oauth-quickstart-guide)
 * endpoint returns `{ user, user_id, hub_id, hub_domain }`. The
 * `hub_id` is the numeric portal id, stable for the life of the
 * portal; uniquely identifies which portal the access token belongs
 * to. V2 stores it as the string-cast value on
 * `integrations.providerAccountId`.
 *
 * Resolution chain (per V1 [`provider-registry.ts:563-602`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/provider-registry.ts#L563)):
 *   1. PRIMARY: `GET /oauth/v1/access-tokens/{accessToken}` —
 *      authentication-free per HubSpot docs (the token is in the URL
 *      path), returns `hub_id` + `hub_domain` + `user` + `user_id`.
 *   2. FALLBACK: `GET /integrations/v1/me` with
 *      `Authorization: Bearer {token}` — returns `portalId` + `userId`
 *      + `hubDomain`. Used only if the access-tokens endpoint fails.
 *
 * `apiVersion: "v3"` — pins HubSpot CRM REST API version. All Slice 13
 * Batch 1 + 2 actions hit `/crm/v3/...` paths; webhook subscription
 * endpoints live at `/webhooks/v3/...`.
 *
 * `healthCheckIntervalMs: 4h` — mid-tier (between Google/Microsoft 6h
 * and "other" 12h). HubSpot CRM is high-traffic; a 4h
 * `GET /oauth/v1/access-tokens/{token}` ping confirms the token still
 * works and surfaces revocation faster. Slice 13 doesn't ship the
 * health-check route itself — manifest declares the cadence so the
 * future health-engine cron picks it up.
 *
 * `scopes.required` — exactly the 18 scopes V1 ships
 * ([`hubspotScopes.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/hubspotScopes.ts)),
 * covering CRM core (contacts/companies/deals), Batch 2 surface
 * (tickets/line items/products/owners), the marketing-automation
 * scope (`automation` — included for the deferred add_to_workflow /
 * remove_from_workflow actions), forms, and the mandatory `oauth`
 * scope (required for basic OAuth functionality per HubSpot's docs).
 *
 *   NOT included: `webhooks` scope. Per current HubSpot docs (and
 *   V1's [`oauthConfig.ts:399-402`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/oauthConfig.ts#L399)
 *   note), the `webhooks` scope is OPTIONAL — programmatic
 *   subscription management via `/webhooks/v3/{appId}/subscriptions`
 *   uses the standard CRM-write scopes the user already grants.
 *   Including `webhooks` here would force users to re-authorize if
 *   the app's HubSpot configuration doesn't whitelist it; omitting
 *   it keeps the consent surface small.
 *
 * `oauthFlows: ["v2"]` — HubSpot's current OAuth 2.0 flow (no PKCE
 * per the Public App configuration). V1's auth-URL generator
 * [`generate-url/route.ts:778-816`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/integrations/auth/generate-url/route.ts#L778)
 * generates a `code_verifier` but never sends `code_challenge` in the
 * authorize URL — V2 does not reproduce that dead-code path.
 */
export const hubspotManifest: ProviderManifest = ProviderManifestSchema.parse({
  id: "hubspot",
  displayName: "HubSpot",
  isEnabled: true,
  apiVersion: "v3",
  tokenScope: "user",
  oauthFlows: ["v2"],
  accountIdField: "hubId",
  scopes: {
    required: [
      "crm.objects.contacts.read",
      "crm.objects.contacts.write",
      "crm.objects.companies.read",
      "crm.objects.companies.write",
      "crm.objects.deals.read",
      "crm.objects.deals.write",
      "crm.objects.line_items.read",
      "crm.objects.line_items.write",
      "crm.objects.products.read",
      "crm.objects.products.write",
      "crm.objects.owners.read",
      "crm.lists.read",
      "crm.lists.write",
      "crm.schemas.deals.read",
      "tickets",
      "automation",
      "forms",
      "oauth",
    ],
    optional: [],
    deprecated: [],
  },
  capabilities: {
    // True: OAuth dispatcher entry registered in services/oauth/dispatcher.ts
    // and manifest registered in integrations/_registry.ts as of Slice 13
    // Commit 2.
    oauth: true,
    // False until Slice 13 Commit 5: consolidated `webhook_received`
    // trigger with subscriptionType discriminator. App-level shared
    // subscriptions with portal-scoped reference counting via
    // hubspot_app_subscriptions + hubspot_subscription_refs tables.
    webhookTrigger: false,
    pollingTrigger: false,
    // True: 10 action handlers registered in services/execution/handlers/
    // _registry.ts as of Slice 13 Commit 3 — CRM core (contacts +
    // companies + deals + add-to-list):
    //   create_contact, update_contact, get_contacts,
    //   create_company, update_company, get_companies,
    //   create_deal,    update_deal,    get_deals,
    //   add_contact_to_list
    //
    // Commit 4 will add Batch 2 (~12 actions across tickets +
    // engagements + line items + products + owners).
    actions: true,
  },
  healthCheckIntervalMs: 4 * 60 * 60 * 1000, // 4h
  refreshable: true,
});
