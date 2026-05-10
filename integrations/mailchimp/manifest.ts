import {
  ProviderManifestSchema,
  type ProviderManifest,
} from "@/contracts/integration";

/**
 * Mailchimp provider manifest.
 *
 * Slice 14 — V2's first email-marketing provider AND **first
 * per-datacenter API-host routing model**. See
 * `docs/slices/slice-14-mailchimp.md` §"Confirmed scope decisions"
 * and §"Webhook signature decision".
 *
 * Capability flags follow V2's honest-state convention. Slice 14
 * Commit 2 (this) lands manifest + OAuth + dispatcher registration +
 * dc-routing foundation — `oauth: true`, the rest `false`. Subsequent
 * commits flip `actions` (Commit 3 — 10 subscriber/audience handlers),
 * `webhookTrigger` (Commit 4 — consolidated `audience_event` trigger),
 * and `pollingTrigger` (Commit 5 — email_opened / link_clicked /
 * campaign_created).
 *
 * Token model — **non-refreshable** opaque bearer:
 *   Mailchimp's OAuth2 flow issues a single non-expiring access token
 *   with NO refresh grant. The token-exchange response carries
 *   `{ access_token, expires_in: 0, scope: null }` only — no
 *   `refresh_token`. The only end-state for a token is user-side
 *   revocation from the Mailchimp account-connected-apps screen. On
 *   401 the per-provider `refreshToken()` throws
 *   `RefreshNotSupportedError("mailchimp")` — matches V2's Slack /
 *   Notion / Shopify / GitHub non-refreshable contract.
 *
 *   **V1 misclassification fix.** V1's
 *   [`authSchemes.ts:64`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/authSchemes.ts#L64)
 *   classifies Mailchimp as `'oauth_with_refresh'`, but
 *   [`provider-registry.ts:662`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/provider-registry.ts#L662)
 *   hardcodes `refresh_token: null` on every token exchange — refresh
 *   is never attempted. The `oauth_with_refresh` declaration is dead
 *   config. V2 corrects this with `refreshable: false`.
 *
 * **Per-datacenter API host routing.** Mailchimp shards its REST API
 * by datacenter prefix (`us1`, `us2`, …, `us21`, `eu1`, …). The
 * datacenter for an account is NOT carried in the access token; it's
 * resolved by a one-time `GET https://login.mailchimp.com/oauth2/metadata`
 * call during OAuth callback and persisted on
 * `integrations.accountMetadata.dc`. Every subsequent action /
 * trigger / lifecycle call routes through
 * `https://${dc}.api.mailchimp.com/3.0/...`. Implementation lives in
 * `_shared/mailchimp/api/_base.ts`; OAuth-callback capture lives in
 * `_shared/mailchimp/api/me.ts`. Missing `dc` at action time throws
 * `MissingDataCenterError` — fail loud, no runtime refetch
 * (V1's [`utils.ts:37`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp/utils.ts#L37)
 * pattern intentionally NOT reproduced).
 *
 * `tokenScope: "user"` — one Mailchimp integration per (user,
 * accountId). Re-authorizing to a different Mailchimp account creates
 * a sibling integration row.
 *
 * `accountIdField: "mailchimpAccountId"` — the stable Mailchimp
 * `account_id` (e.g. `"8d3a3db4d97663a9074efcc16"`) resolved from
 * `GET https://${dc}.api.mailchimp.com/3.0/` at OAuth callback time.
 * Stable for the life of the account; uniquely identifies which
 * Mailchimp account the access token belongs to. V2 string-casts at
 * the boundary so `integrations.providerAccountId` stays a stable
 * text column.
 *
 * `apiVersion: "3.0"` — pinned via the URL path on every REST call
 * (`https://${dc}.api.mailchimp.com/3.0/...`). The const is mirrored
 * in `_shared/mailchimp/api/_base.ts` so the wire surface stays in
 * lockstep.
 *
 * `healthCheckIntervalMs: 12h` — matches V2's "other providers" tier
 * (Slack, Notion, Discord, Airtable, Stripe, Shopify). Mailchimp's
 * API is gentle on rate limits; a 12h `GET /3.0/` ping confirms the
 * bearer still works. Slice 14 doesn't ship the health-check route
 * itself — manifest declares the cadence so the future health-engine
 * cron picks it up.
 *
 * `scopes.required: ["account_access"]` — **synthetic placeholder**.
 * Mailchimp's OAuth2 flow grants account-wide access and **does NOT
 * enforce scope parameters** — the `scope` query parameter on the
 * authorize URL is documented but ignored, and the token-exchange
 * response carries `scope: null`. The V2 manifest contract
 * (`contracts/integration.ts` superRefine) requires OAuth providers
 * to declare ≥1 required scope; `"account_access"` is a synthetic
 * documentation-only declaration that satisfies the contract while
 * accurately reflecting the access model. The string is NEVER sent
 * to Mailchimp (the `buildAuthUrl` implementation omits the `scope=`
 * URL parameter entirely). It surfaces in V2's connection UI as a
 * single "Account Access" consent line so users see the equivalent
 * of "this integration can do anything in your Mailchimp account",
 * which is the truth.
 *
 *   V1's [`availableIntegrations.ts:301`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/availableIntegrations.ts#L301)
 *   declares `["campaigns", "lists", "automations"]` for the same
 *   documentation purpose — these are not real Mailchimp scopes
 *   either; they're V1 UI labels. V2 collapses to a single honest
 *   label since the underlying access is uniform.
 *
 * `oauthFlows: ["v2"]` — Mailchimp's current OAuth 2.0 flow.
 *
 * No PKCE — Mailchimp's authorize endpoint at
 * `https://login.mailchimp.com/oauth2/authorize` doesn't require or
 * accept `code_challenge` / `code_challenge_method` parameters. The
 * per-provider OAuth omits `generatePkce()`; the dispatcher passes
 * `null` to `buildAuthUrl` and `handleCallback`.
 *
 * `refreshable: false` — see Token model note above. Mailchimp fills
 * V2's body-auth + non-refreshable + user-scope cell alongside
 * GitHub (which is body-auth + non-refreshable + user-scope as well,
 * but uses a different scope-enforcement model — GitHub's scopes are
 * real and enforced; Mailchimp's are documentation only).
 */
export const mailchimpManifest: ProviderManifest = ProviderManifestSchema.parse({
  id: "mailchimp",
  displayName: "Mailchimp",
  isEnabled: true,
  apiVersion: "3.0",
  tokenScope: "user",
  oauthFlows: ["v2"],
  accountIdField: "mailchimpAccountId",
  scopes: {
    // Synthetic single-scope declaration — Mailchimp doesn't enforce
    // scopes. See doc comment above. The string is never sent to
    // Mailchimp; the buildAuthUrl omits scope= entirely.
    required: ["account_access"],
    optional: [],
    deprecated: [],
  },
  capabilities: {
    // True: OAuth dispatcher entry registered in
    // services/oauth/dispatcher.ts and manifest registered in
    // integrations/_registry.ts as of Slice 14 Commit 2.
    oauth: true,
    // Flips true in Slice 14 Commit 4 — consolidated `audience_event`
    // trigger with eventTypes: string[] multi-select discriminator
    // (subscribe, unsubscribe, profile, upemail, cleaned, campaign).
    // Per-audience webhook lifecycle. Webhook route at
    // /api/webhooks/mailchimp with workflowId/nodeId URL routing +
    // audienceId match + eventType allowlist + sha256(rawBody) dedup.
    // Mailchimp doesn't sign webhooks — see plan doc §"Webhook
    // signature decision".
    webhookTrigger: false,
    // Flips true in Slice 14 Commit 5 — three polling triggers:
    // email_opened, link_clicked, campaign_created. Snapshot-baseline
    // on activate to prevent first-poll-miss / first-poll-storm.
    // 5-minute cadence.
    pollingTrigger: false,
    // True: 10 action handlers registered in
    // services/execution/handlers/_registry.ts as of Slice 14
    // Commit 3 — subscriber/audience surface:
    //   add_subscriber, update_subscriber, remove_subscriber,
    //   add_tag, remove_tag, get_subscriber,
    //   create_segment, create_audience, create_custom_event,
    //   add_note.
    // REST-only via _shared/mailchimp/api wrappers; per-integration
    // base URL routing sourced from the integration row's
    // accountMetadata.dc (resolved at action time via
    // integrations/mailchimp/actions/_resolveDc.ts). All actions wrap
    // their principal call in refreshAndRetry; 401s surface as
    // IntegrationActionRequiredError(reason: "refresh_not_supported")
    // since Mailchimp is non-refreshable (matches Slack / Notion /
    // Shopify / GitHub).
    actions: true,
  },
  healthCheckIntervalMs: 12 * 60 * 60 * 1000, // 12h
  refreshable: false,
});
