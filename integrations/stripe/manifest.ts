import {
  ProviderManifestSchema,
  type ProviderManifest,
} from "@/contracts/integration";

/**
 * Stripe provider manifest.
 *
 * Slice 11 — V2's first body-auth refreshable OAuth provider, and the
 * first Stripe Connect (platform-vs-merchant) provider. See
 * `docs/slices/slice-11-stripe.md` §"OAuth model — refreshable +
 * body-auth + Stripe Connect (no PKCE)".
 *
 * Capability flags follow the V2 honest-state convention. Slice 11
 * Commit 2 (this) lands manifest + OAuth + dispatcher registration —
 * `oauth: true`, the rest `false`. Subsequent commits flip `actions`
 * (Commit 3) and `webhookTrigger` (Commit 4).
 *
 * Token model — refreshable with NON-rotated refresh tokens:
 *   Stripe Connect's OAuth flow issues both an access token and a
 *   refresh token (per the `authorization_code` grant). Per current
 *   Stripe Connect docs, the refresh_token is NOT rotated on each
 *   refresh — the same value can be reused indefinitely. Stripe's
 *   token endpoint MAY occasionally include a fresh refresh_token in
 *   the response (defense-in-depth rotation); when present, V2
 *   persists the new value, when absent, V2 preserves the original.
 *
 *   This contrasts with Airtable's mandatory rotation (Slice 10) and
 *   validates V2's `dispatcher.refresh` → `updateTokens` flow on the
 *   stable-refresh-token path. The per-provider `refreshToken()` in
 *   `integrations/stripe/oauth.ts` enforces the preserve-or-replace
 *   semantics.
 *
 *   Stripe Connect access tokens historically don't carry an
 *   `expires_in` field — they're long-lived per current docs. V2's
 *   `refreshToken()` records `expires_in` IF present (defensive against
 *   future Stripe behavior changes), or `null` otherwise. V1's
 *   `oauthConfig.ts:537` `accessTokenExpiryBuffer: 30` was a pre-emptive
 *   refresh-window heuristic; V2 drops it because the reactive
 *   `refreshAndRetry` 401 → refresh path doesn't need pre-emptive
 *   expiry math.
 *
 * `tokenScope: "user"` — one Stripe integration per (user,
 * stripe_user_id). Each Stripe Connect authorize flow grants tokens
 * scoped to a specific connected merchant account; reauthorizing
 * against a different merchant creates a sibling integration row.
 *
 * `accountIdField: "stripeUserId"` — Stripe Connect's
 * `/oauth/token` response includes `stripe_user_id` (e.g.
 * `acct_1AbCDeFg...`), the connected merchant's Stripe account id.
 * Stable for the life of the merchant's Stripe account; uniquely
 * identifies which merchant the access token belongs to.
 *
 * `apiVersion: "2025-05-28.basil"` — pins the Stripe API version sent
 * via the `Stripe-Version` header on all REST calls (Slice 11 Commit
 * 3). Matches V1's `lib/stripe/client.ts:15` pin so the wire-format
 * surface area is identical between V1 and V2 during the cutover. May
 * be bumped to a newer GA version in a follow-up slice once V2
 * exercises broader Stripe surface area.
 *
 * `healthCheckIntervalMs: 12h` — matches V2's "other providers" tier
 * (Notion, Slack, Discord, Airtable). Stripe's API is gentle on rate
 * limits; a 12h `GET /v1/account` ping confirms the merchant token is
 * still valid. Slice 11 doesn't ship the health-check route itself —
 * the manifest declares the cadence so the future health-engine cron
 * can pick it up alongside other 12h providers.
 *
 * `scopes.required: ["read_write"]` — Stripe Connect's scope model is
 * binary (`read_only` vs `read_write`); all 10 actions in Slice 11
 * Batch 1 require `read_write` (POST/PATCH/DELETE on customers,
 * payment_intents, refunds, subscriptions). `read_only` deferred —
 * workflows that only read data can be added in a future batch.
 *
 * `oauthFlows: ["v2"]` — Stripe Connect's current OAuth 2.0 flow.
 *
 * No PKCE — Stripe Connect's authorize endpoint does not accept
 * `code_challenge` / `code_challenge_method` parameters. The
 * per-provider OAuth omits `generatePkce()`; the dispatcher passes
 * `null` to `buildAuthUrl` and `handleCallback`.
 */
export const stripeManifest: ProviderManifest = ProviderManifestSchema.parse({
  id: "stripe",
  displayName: "Stripe",
  isEnabled: true,
  apiVersion: "2025-05-28.basil",
  tokenScope: "user",
  oauthFlows: ["v2"],
  accountIdField: "stripeUserId",
  scopes: {
    required: ["read_write"],
    optional: [],
    deprecated: [],
  },
  capabilities: {
    oauth: true,
    // True: `event_received` webhook trigger registered in
    // integrations/stripe/triggers/eventReceived. Webhook route
    // lives at /api/webhooks/stripe. NO renewal handler — Stripe
    // webhook endpoints don't expire (the `runRenewals` cron filters
    // on `config.type === "subscription-watch"` and Stripe's
    // activate hook intentionally omits the marker).
    webhookTrigger: true,
    pollingTrigger: false,
    // True: 12 action handlers (create_customer, update_customer,
    // find_customer, create_payment_intent, confirm_payment_intent,
    // capture_payment_intent, create_refund, create_subscription,
    // update_subscription, cancel_subscription, create_checkout_session,
    // create_payment_link) registered in
    // services/execution/handlers/_registry.ts. Slice 11 Commit 3
    // shipped 10; Stripe 2.1 Commits 1 + 2 added create_checkout_session
    // and create_payment_link.
    actions: true,
  },
  healthCheckIntervalMs: 12 * 60 * 60 * 1000, // 12h
  refreshable: true,
});
