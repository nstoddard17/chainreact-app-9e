import {
  ProviderManifestSchema,
  type ProviderManifest,
} from "@/contracts/integration";

/**
 * Shopify provider manifest.
 *
 * Slice 12 — V2's first per-shop multi-tenant OAuth provider. See
 * `docs/slices/slice-12-shopify.md` §"OAuth model — per-shop validation"
 * and §"Confirmed scope decisions".
 *
 * Capability flags follow V2's honest-state convention. Slice 12 Commit
 * 2 (this) lands manifest + OAuth + dispatcher registration —
 * `oauth: true`, the rest `false`. Subsequent commits flip `actions`
 * (Commit 3) and `webhookTrigger` (Commit 4).
 *
 * Token model — non-refreshable offline access:
 *   Shopify offline access tokens issued at install time don't expire
 *   and don't have a refresh grant. The only end-state for an offline
 *   token is merchant-side app uninstall (token revoked). On 401 the
 *   per-provider `refreshToken()` throws `RefreshNotSupportedError`,
 *   matching V2's Slack / Notion non-refreshable contract. V1's
 *   [`authSchemes.ts:65-69`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/authSchemes.ts#L65)
 *   confirms `'non_refreshable'`.
 *
 * `tokenScope: "user"` — one Shopify integration per (user,
 * `providerAccountId=shopDomain`). A user re-authorizing to a different
 * shop creates a sibling integration row.
 *
 * `accountIdField: "shopDomain"` — the full `*.myshopify.com` domain
 * resolved at OAuth callback time from the validated `providerHint.shop`
 * value. Stable for the life of the merchant's Shopify account; uniquely
 * identifies which shop the access token belongs to. V1 stored the same
 * fact across `integrations.shop_domain` + `metadata.shop` — V2
 * collapses to `providerAccountId`.
 *
 * `apiVersion: "2024-10"` — Shopify pins API versions per quarter; this
 * matches V1's pinned version
 * ([`ShopifyTriggerLifecycle.ts:97`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/providers/ShopifyTriggerLifecycle.ts#L97))
 * and stays valid for the Slice 12 implementation window. The const is
 * mirrored in `_shared/shopify/api/_base.ts` (Commit 3) so the wire
 * surface stays in lockstep.
 *
 * `healthCheckIntervalMs: 12h` — matches V2's "other providers" tier
 * (Notion, Slack, Discord, Airtable, Stripe). Shopify's API is gentle
 * on rate limits; a 12h `GET /admin/api/2024-10/shop.json` ping
 * confirms the merchant token still works. Slice 12 doesn't ship the
 * health-check route — manifest declares the cadence so the future
 * health-engine cron picks it up.
 *
 * `scopes.required: 11 scopes` — covers every action and trigger in
 * Slice 12 Batch 1. V1 audit lines up exactly: the trigger nodes
 * declare `read_orders` / `read_checkouts` / `read_products` /
 * `read_customers` / `read_inventory`; the action nodes declare
 * `write_orders` / `write_products` / `write_customers` /
 * `write_inventory` / `write_fulfillments`. `read_fulfillments` is
 * implicitly required by `create_fulfillment` (Shopify's scope model
 * requires both halves for fulfillment management).
 *
 * `scopes.optional: ["read_locations"]` — RESOLVERS-2. Read-only, picker-
 * only (`shopify:locations` → `update_inventory.location_id`); see the
 * inline note on the field for why it is optional rather than required.
 *
 * `oauthFlows: ["v2"]` — Shopify's current OAuth 2.0 flow. The
 * "online vs offline" access-mode distinction (Shopify ships both)
 * is irrelevant here — V2 always requests offline (the default for
 * the authorize URL when `access_mode` query is omitted), which
 * yields the long-lived non-refreshable token we want.
 *
 * No PKCE — Shopify's authorize endpoint at
 * `https://{shop}.myshopify.com/admin/oauth/authorize` doesn't require
 * or accept `code_challenge` / `code_challenge_method` parameters. The
 * per-provider OAuth omits `generatePkce()`; the dispatcher passes
 * `null` to `buildAuthUrl` and `handleCallback`.
 *
 * `refreshable: false` — the JWT-bound providerHint plumbing introduced
 * in Slice 12 is orthogonal to refreshability. Shopify is the first
 * V2 provider that's both `refreshable: false` AND uses providerHint;
 * Mailchimp would be the second once it lands.
 */
export const shopifyManifest: ProviderManifest = ProviderManifestSchema.parse({
  id: "shopify",
  displayName: "Shopify",
  isEnabled: true,
  apiVersion: "2024-10",
  tokenScope: "user",
  oauthFlows: ["v2"],
  accountIdField: "shopDomain",
  scopes: {
    required: [
      "read_orders",
      "write_orders",
      "read_products",
      "write_products",
      "read_customers",
      "write_customers",
      "read_inventory",
      "write_inventory",
      "read_checkouts",
      "read_fulfillments",
      "write_fulfillments",
    ],
    optional: [
      // RESOLVERS-2 — needed ONLY by the `shopify:locations` options
      // resolver (GET /locations.json), which backs the location picker
      // on `update_inventory`. OPTIONAL, not required, on purpose: no
      // ACTION handler needs it (update_inventory only WRITES against a
      // location id it is given), and promoting it to required would
      // force every already-connected store to reconnect just to gain a
      // picker. Same posture as the optional `MailboxSettings.Read`
      // scope on integrations/microsoft-outlook/manifest.ts.
      //
      // NOTE: existing connections predate this scope — the picker
      // surfaces PROVIDER_REAUTH_REQUIRED (Reconnect) until the merchant
      // re-authorizes, and manual entry / upstream {{...}} mapping keeps
      // the field fully usable meanwhile. Shopify tokens are
      // non-refreshable, so re-consent was always the only path anyway.
      // The scope must also be added to the app's configured scope list
      // in the Shopify Partner dashboard before consent can include it.
      "read_locations",
    ],
    deprecated: [],
  },
  capabilities: {
    oauth: true,
    // True: consolidated `webhook_received` trigger registered via
    // integrations/shopify/triggers/webhookReceived. Webhook route
    // lives at /api/webhooks/shopify. NO renewal handler — Shopify
    // webhook subscriptions don't expire (the `runRenewals` cron
    // filters on `config.type === "subscription-watch"` and the
    // activate hook intentionally omits the marker — same permanent-
    // endpoint pattern Slice 11 / Stripe established).
    webhookTrigger: true,
    pollingTrigger: false,
    // True: 10 action handlers (create_order, update_order_status,
    // add_order_note, create_fulfillment, create_product,
    // update_product, create_product_variant, create_customer,
    // update_customer, update_inventory) registered in
    // services/execution/handlers/_registry.ts as of Slice 12
    // Commit 3. REST-only via _shared/shopify/api wrappers; per-shop
    // base URL routing sourced from the integration row's
    // providerAccountId (= shopDomain). All actions wrap their
    // principal call in refreshAndRetry; 401s surface as
    // IntegrationActionRequiredError(reason: "refresh_not_supported")
    // since Shopify is non-refreshable.
    actions: true,
  },
  healthCheckIntervalMs: 12 * 60 * 60 * 1000, // 12h
  refreshable: false,
  // Per-shop OAuth: the authorize URL is `https://{shop}/admin/oauth/...`,
  // so the merchant's `*.myshopify.com` domain must be captured before the
  // redirect and sent as `providerHint.shop`. The Apps UI prompts for this;
  // shopifyOAuth.validateProviderHint is the authoritative validator.
  connectInput: {
    hintKey: "shop",
    label: "Shopify store domain",
    placeholder: "your-store.myshopify.com",
    help: "Enter your store's .myshopify.com domain so we can send you to the right store to authorize.",
  },
});
