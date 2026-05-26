# Slice 11 — **Stripe** provider port

**Branch:** `slice-11-stripe` (off `slice-10-airtable` @ `23822ba6e`).
**Reference codebase:** `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e` (V1).
**Goal:** Port Stripe from V1 as the **first body-auth refreshable OAuth provider** in V2 *and* the **first `Stripe-Signature` style webhook with HMAC-of-`{timestamp}.{rawBody}` verification**. Ships an OAuth dispatcher entry (refreshable + body-auth + Stripe Connect), 10 typed action handlers covering customer/payment-intent/refund/subscription, a typed `flattenForStripe` bracket-notation form-encoding utility, plus a single consolidated `event_received` webhook trigger that dispatches per Stripe `event.type` discriminator.

Slice 11 introduces THREE new V2 patterns simultaneously:

1. **Body-auth OAuth.** V2 has validated Basic-auth (Airtable, Notion, Microsoft) and Bearer-style refresh (Google) flows. Stripe Connect requires `client_secret` in the form-encoded **request body**, not a `Basic` Authorization header. Stripe's token endpoint at `https://connect.stripe.com/oauth/token` accepts both shapes today, but V1 (`oauthConfig.ts:537` `authMethod: "body"`) and current Stripe Connect docs use body auth. Slice 11 adds the body-auth path to V2's per-provider OAuth implementations — no shared dispatcher change needed because every V2 provider currently implements `handleCallback` / `refreshToken` directly.
2. **Stripe Connect platform-vs-merchant separation.** Every other refreshable V2 provider (Google × 4, Microsoft × 3, Airtable, Notion bot) returns a token that talks to the **same account** the user authorized. Stripe Connect returns a token scoped to a connected merchant account (`stripe_user_id: "acct_xxx"`); the **platform's own** secret key (`STRIPE_CLIENT_SECRET`) is what creates webhook endpoints with `connect: true` so events from connected accounts land at V2's webhook URL. Slice 11 cleanly separates these — provider-OAuth tokens go through `refreshAndRetry` and call merchant-scoped REST endpoints; webhook-endpoint management uses the platform key directly.
3. **`{timestamp}.{rawBody}` HMAC signature verification.** Different from every existing V2 webhook trigger. Slack's signature is HMAC of `v0:${timestamp}:${rawBody}` with the app signing secret (header: `X-Slack-Signature: v0=<hex>` + separate `X-Slack-Request-Timestamp`). Microsoft Graph signs the validation handshake but not subsequent notifications. Airtable's signature is HMAC of the raw body alone (no timestamp prefix). Stripe is **the canonical `Stripe-Signature: t=<unix>,v1=<hex>,v1=<hex>` shape** — one header carrying both timestamp and one-or-more candidate signatures, signed payload `${timestamp}.${rawBody}`, replay-protected via timestamp tolerance window. Slice 11 builds the primitive that future Stripe-style providers (Square, Shopify HMAC, GitHub) can reuse.

Slice 11 also **introduces V2's first Q4-driven provider-side `Idempotency-Key` HTTP header**. Stripe's `Idempotency-Key` is the canonical example of provider-supplied side-effect dedup; V2's `core/workflows/idempotency.ts` `buildIdempotencyKey({sessionId, nodeId, actionType})` already returns a stable key, and Slice 11 is the first slice that threads it onto an outbound provider POST as defense-in-depth alongside V2's session-side checkReplay/recordFired flow.

---

## Why Stripe now

Confirmed via deep V1 audit + cross-check against current Stripe Connect API docs (this commit):

1. **Validates V2's body-auth OAuth contract.** Notion / Airtable / Microsoft all use Basic auth (`Authorization: Basic ${base64(client_id:client_secret)}`); Google uses bearer-with-form-body but the secret is part of the body too. Stripe Connect uses **only** body auth (`client_secret=sk_xxx` in `application/x-www-form-urlencoded`). Slice 11 proves V2's per-provider OAuth implementations can express both shapes — the dispatcher / `refreshAndRetry` / `updateTokens` flow is wire-format-agnostic.
2. **Validates Stripe Connect platform/merchant split.** Distinguishes the *user-installed integration* (which owns merchant tokens that talk to `api.stripe.com` for the connected account) from *platform-owned webhook lifecycle* (which owns platform secret talking to `api.stripe.com` for the platform's own webhook endpoints). V1 conflates these (`StripeTriggerLifecycle.ts:31-39` reads `STRIPE_CLIENT_SECRET` for webhook management — same env var V1 also uses for OAuth client secret). V2 keeps `STRIPE_CLIENT_ID` + `STRIPE_CLIENT_SECRET` for OAuth Connect client credentials; the platform secret used for webhook-endpoint management can be the same `STRIPE_CLIENT_SECRET` (Stripe Connect platforms have one secret key) — the *separation* is conceptual, not env-var-level.
3. **Establishes the `Stripe-Signature` verification primitive.** Future providers with the same shape (any HMAC-with-timestamp header) reuse the V2 helper Slice 11 introduces at `_shared/stripe/webhooks/signature.ts`. Constant-time compare, configurable tolerance window (default 300s per Stripe SDK), supports multiple `v1=` candidates (Stripe rotates secrets via two-active-secrets period during rotation).
4. **Validates V2's `Idempotency-Key` header threading.** V2 has Q4 helpers (`buildIdempotencyKey`, `hashPayload`) but no live-traffic provider currently sends the formatted key as a header to a real provider's POST. Stripe is the canonical case — Stripe's docs explicitly reference `Idempotency-Key` for safe retry on Create operations. Slice 11 wires the formatted key onto `create_customer`, `create_payment_intent`, `create_refund`, `create_subscription` (the four Q4-relevant POSTs in Batch 1).
5. **High product value.** Payment / subscription automation is the most-requested non-Slack/non-Google trigger surface in V1 telemetry. V1 has 14 Stripe trigger event types and 25+ Stripe action types — V2 ships a focused 10-action / single-trigger-with-event-discriminator subset that covers the 80% case.
6. **Light external setup.** Stripe Connect platform app registration (already done in V1; `STRIPE_CLIENT_ID` env present), Stripe webhook signing secret (returned at endpoint creation; stored per-trigger in `trigger_resources.config`). No PKCE, no admin consent, no separate platform-vs-app secret.
7. **V1 has strong reusable code.** `flattenForStripe` (`lib/workflows/actions/stripe/utils.ts`, 35 LOC) is battle-tested against a real production incident (nested objects serializing as `[object Object]` → `parameter_invalid_string`). Action body construction for the 10 selected handlers is mostly mechanical port. V1's webhook signature verification leans on Stripe's SDK (`stripe.webhooks.constructEvent`); V2 reimplements directly to keep the boundary tight (no Stripe SDK in the per-action handlers; it stays in `_shared/stripe/`).

---

## Confirmed scope decisions

1. **New provider id — `stripe`.** Standard V2 provider folder (`integrations/stripe/`) + dispatcher route. Single Stripe OAuth integration per (user, `stripe_user_id`).
2. **Ten actions — `create_customer`, `update_customer`, `find_customer`, `create_payment_intent`, `confirm_payment_intent`, `capture_payment_intent`, `create_refund`, `create_subscription`, `update_subscription`, `cancel_subscription`.** Per-action V1 audit + classification in §"V1 audit" below. **Defer:** `create_checkout_session`, `create_payment_link`, `create_product`, `update_product`, `list_products`, `create_price`, `create_invoice`, `update_invoice`, `finalize_invoice`, `void_invoice`, `find_invoice`, `create_invoice_item`, `find_charge`, `find_payment_intent`, `find_subscription`, `get_payments`, `get_customers`, dispute/ACH/bank-account flows, advanced tax/coupon/promotion surfaces.
3. **One consolidated trigger — `event_received`** with payload `eventType` discriminator (the Stripe event type string, e.g. `"payment_intent.succeeded"`, `"customer.subscription.deleted"`). V1 splits into 14 separate trigger node types (`stripe_trigger_new_payment`, `stripe_trigger_subscription_created`, …) each mapping to a curated `enabled_events` array. V2 normalizes to ONE trigger that workflows can branch on via the `eventType` field — mirrors Slice 7 (calendar) and Slice 10 (Airtable record-changed) consolidation. The trigger config presents a multi-select of supported Stripe event types; activation creates one webhook endpoint per trigger with the user-selected `enabled_events`.
4. **Curated event-type allowlist (Batch 1) — 16 types:** `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.created`, `charge.succeeded`, `charge.failed`, `charge.refunded`, `charge.dispute.created`, `customer.created`, `customer.updated`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`, `checkout.session.completed`, `customer.deleted`. Selected to cover V1's 14 trigger node types + the most-common upgrade paths. Deferred event types (any not in the allowlist) are rejected at activation with a typed validation error so workflow authors fail loud at design time. The allowlist lives as a const in `integrations/stripe/triggers/eventReceived/allowedEventTypes.ts` and is the single source of truth for the trigger's config schema (Q11).
5. **OAuth — refreshable + body-auth + Stripe Connect (no PKCE).** Manifest declares `refreshable: true`. Token exchange POSTs to `https://connect.stripe.com/oauth/token` with `application/x-www-form-urlencoded` body containing `grant_type=authorization_code`, `code`, `client_secret` (in body, NOT Basic header). Refresh: same endpoint with `grant_type=refresh_token`, `refresh_token`, `client_secret`. **Refresh tokens are NOT rotated** per Stripe Connect docs — the same refresh_token can be reused; new access_tokens are issued per refresh. V2's `dispatcher.refresh` → `updateTokens` flow tolerates either rotation behavior (Stripe falls into the "stable refresh token" path; Airtable falls into the "rotated refresh token" path). **No PKCE.** Stripe Connect doesn't require or accept a `code_challenge` parameter; manifest omits `generatePkce()`. **`scope` parameter** sent on authorize URL (`read_write` for full Connect access; `read_only` deferred). **`accessTokenExpiresAt`** — Stripe Connect access tokens are long-lived per current docs; V2 records whatever `expires_in` is returned (or `null` if absent) in the token row. V1's `accessTokenExpiryBuffer: 30` is a pre-emptive refresh window — V2 doesn't need it because `refreshAndRetry`'s 401-driven refresh path is reactive, not pre-emptive.
6. **OAuth scopes — exactly one (Batch 1):** `read_write`. Stripe Connect's scope model is binary (`read_only` vs `read_write`); all 10 actions in Batch 1 require `read_write` (POST/PATCH/DELETE on customers, payment_intents, refunds, subscriptions). `read_only` deferred — workflows that only read data can be added in a future batch.
7. **`tokenScope` — `user`.** One Stripe integration per (user, `stripe_user_id`). The `stripe_user_id` returned in the token response is the connected merchant account id (`acct_xxx`).
8. **`accountIdField` — `stripeUserId`.** Stripe Connect's token response includes `stripe_user_id: "acct_..."` — the connected merchant's Stripe account id. V2's `ProviderAccountInfo.providerAccountId` = this value. V1 uses the same field (`StripeTriggerLifecycle.ts:118` `account_id` config).
9. **`apiVersion` — `2024-11-20.acacia`** (or current pinned version at implementation time). All `_shared/stripe/api/_request.ts` calls send `Stripe-Version: <pinned>` header. V1 pins `2025-05-28.basil` in the platform Stripe SDK config — V2 picks the latest GA version at implementation time and pins it as a const.
10. **Health check interval — 12h.** Matches V2's "other providers" tier (Notion, Slack, Discord, Airtable). Stripe's API is gentle on rate limits; a 12h `/v1/account` ping confirms the merchant token is still valid.
11. **Health check endpoint — `GET /v1/account`** (returns the connected account profile). 200 → healthy; 401 → action_required after refresh attempt fails.
12. **Webhook subscription resource — `/v1/webhook_endpoints`.** One subscription per trigger — workflows pick a curated set of event types at trigger config time. Endpoint is created **on the platform's Stripe account** with `connect: true` so events from connected merchant accounts (any account whose token is stored in V2) flow to the V2 webhook URL. Body: `{ url, connect: true, enabled_events, description, api_version }`. Response: `{ id, secret, ... }`. V2 stores the per-endpoint `secret` in `trigger_resources.config.webhookSecret`.
13. **Webhook signature — HMAC-SHA256 hex, `Stripe-Signature: t=<unix>,v1=<hex>` (one or more `v1=` entries).** Constant-time compare via `crypto.timingSafeEqual`. **Tolerance window** — 300s default (matches Stripe SDK default), configurable. Signed payload format: `${timestamp}.${rawBody}`. **Multiple `v1=` candidates** supported (during secret rotation Stripe sends signatures from both the old and new secret simultaneously) — match on any. V1 leans on Stripe SDK's `stripe.webhooks.constructEvent` which handles all of the above; V2 reimplements directly in `_shared/stripe/webhooks/signature.ts` to keep the action / webhook layer SDK-free (boundary discipline).
14. **Webhook endpoint expiration — never.** Stripe webhook endpoints don't expire. V2 does NOT register a renewal handler with `subscriptionRegistry` for Stripe — webhooks created at activation persist until explicit deactivation. The trigger's index file registers activation + deactivation only.
15. **Trigger dedup key — `event.id`.** Each Stripe event has a globally unique `id` (`evt_xxx`) that is stable across Stripe's retry attempts (Stripe retries with the same event id for up to 3 days on non-2xx responses). V2's `webhook_event_dedup` keyed on `(provider, event.id)` blocks duplicates from retry storms. V2 normalizes `eventId: event.id` on the `TriggerEvent` shape; `webhook_event_dedup` does the rest.
16. **Webhook receive route — `/api/webhooks/stripe`.** **Direct lookup by `workflowId` query param** (per accepted plan) — endpoint URL is `https://<host>/api/webhooks/stripe?workflowId=<workflow_id>`. Receive route reads `workflowId` from the query, looks up the *single* `trigger_resources` row for that workflow, verifies the signature against THAT row's `webhookSecret`, and dispatches. **NO multi-secret fallback** (V1 rot — `app/api/webhooks/stripe-integration/route.ts:175-228` tries every active webhook secret in the database until one verifies; this is wasteful, has performance implications at scale, and silently masks misconfigurations). V2's tight contract: missing `workflowId` query param → 400 reject; trigger row lookup fails → 404 reject; signature verify fails → 401 reject.
17. **Idempotency-Key header on POSTs — four actions** (`create_customer`, `create_payment_intent`, `create_refund`, `create_subscription`). **Format** — `formatProviderIdempotencyKey({sessionId, nodeId, actionType})` → `"${sessionId}:${nodeId}:${actionType}"`. V2's existing `core/workflows/idempotency.ts` provides `buildIdempotencyKey` + `hashPayload` already; Slice 11 adds the `formatProviderIdempotencyKey` helper alongside (returns the string format Stripe expects in the HTTP header — same V1 shape). Other actions (`update_*`, `confirm_*`, `capture_*`, `cancel_*`, `find_*`) don't use Idempotency-Key per V1 (lower-stakes operations, Stripe's own retry semantics don't apply meaningfully).
18. **No new DB migration.** All state fits existing `integrations` (refresh token rotates into `refresh_token_encrypted`) and `trigger_resources` (`config.webhookSecret`, `config.enabledEvents`, `config.stripeAccountId`, `config.webhookUrl`). **STOP-AND-REPORT** if a new table is needed.
19. **No app-billing entanglement.** V2's app-billing Stripe code (CLAUDE.md §8 — `lib/billing/`, `app/api/webhooks/stripe-billing/`, etc.) is for ChainReact's own Stripe usage (charging customers for ChainReact subscriptions). V2 already separates this from user-provider Stripe — `app/api/webhooks/stripe-billing/` (app billing) vs `app/api/webhooks/stripe/` (user provider, Slice 11). Slice 11 lives entirely under `integrations/stripe/` and uses its own webhook route — zero shared code with `lib/billing/`.
20. **No orphan-endpoint cleanup cron.** V1's `StripeTriggerLifecycle.cleanupOrphanedEndpoints()` (`StripeTriggerLifecycle.ts:300-349`) walks every Stripe webhook endpoint on the platform, diffs against `trigger_resources.external_id`, and deletes untracked endpoints. V2 doesn't ship this — orphan endpoints are a deactivation-bug remediation tool, not a steady-state requirement, and V2's deactivate path is straight-line (no swallow on unexpected errors). If orphans show up in real V2 traffic, they're a P2 cleanup script, not a per-provider lifecycle hook.

---

## Six confirmation answers

| Question | Answer | Citation |
|---|---|---|
| **1. Stripe Connect OAuth refreshable?** | **Yes — and refresh tokens are NOT rotated.** Token exchange POSTs `https://connect.stripe.com/oauth/token` with `application/x-www-form-urlencoded` body containing `grant_type=authorization_code`, `code`, `client_secret`. Response: `{ access_token, refresh_token, scope, livemode, stripe_user_id, stripe_publishable_key, token_type }`. Refresh: same endpoint with `grant_type=refresh_token`, `refresh_token`, `client_secret`. Same `refresh_token` can be reused indefinitely (different from Airtable's rotation). V1's `oauthConfig.ts:537` `authMethod: "body"` and `refreshTokenExpirationSupported: false` (= "refresh tokens have no expiration metadata") confirm. | Current Stripe Connect docs: stripe.com/docs/connect/oauth-reference (this commit). V1: [`oauthConfig.ts:530-543`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/oauthConfig.ts#L530). |
| **2. PKCE required?** | **No.** Stripe Connect's authorize endpoint doesn't accept `code_challenge` / `code_challenge_method` parameters. Manifest omits `generatePkce()`. | Current Stripe Connect docs (this commit). V1: no PKCE config in `oauthConfig.ts:530-543`. |
| **3. Webhook subscription model?** | **Programmatic — created on the PLATFORM Stripe account.** POST `https://api.stripe.com/v1/webhook_endpoints` with `application/x-www-form-urlencoded` body: `url`, `connect=true`, `enabled_events[]`, `description`, `api_version`. Response: `{ id, secret, url, connect, enabled_events, livemode, status, ... }`. Endpoint becomes active immediately — no validation handshake. **Endpoints don't expire.** Created with platform's secret key (`STRIPE_CLIENT_SECRET` env), not the merchant's OAuth-issued access token. The `connect: true` flag tells Stripe to forward events from any of the platform's connected accounts (the merchants who OAuth'd in via `integrations/stripe/oauth.ts`). | Current Stripe docs: stripe.com/docs/api/webhook_endpoints/create (this commit). V1: [`StripeTriggerLifecycle.ts:108-114`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/providers/StripeTriggerLifecycle.ts#L108). |
| **4. Inbound notification format?** | **Full event payload in the POST body** (unlike Airtable's ping-only). Body shape: `{ id: "evt_xxx", object: "event", api_version, created, type: "payment_intent.succeeded", data: { object: { ... } }, livemode, account?: "acct_xxx", ... }`. V2 trusts the body — no separate fetch step. Signature header: `Stripe-Signature: t=<unix-timestamp>,v1=<hex>,v1=<hex>`. Multiple `v1=` candidates allowed during secret rotation. The `account` field on the event payload identifies the connected merchant account that originated the event (Connect webhooks only — direct platform events omit it). | Current Stripe docs: stripe.com/docs/webhooks/signatures (this commit). V1: [`stripe-integration/route.ts:137-194`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/webhooks/stripe-integration/route.ts#L137). |
| **5. Signature verification algorithm?** | **HMAC-SHA256 over `${timestamp}.${rawBody}` keyed with the per-endpoint `secret` (returned at endpoint creation as `whsec_xxx`).** Algorithm: parse the `Stripe-Signature` header into `t=...` and one-or-more `v1=...` segments. Compute `expected = hmacSha256Hex("${t}.${rawBody}", secret)`. Reject if `Math.abs(now - t) > toleranceWindow` (default 300s) — replay protection. Then constant-time compare `expected` against each `v1=` candidate; accept on any match. V1 uses Stripe SDK's `stripe.webhooks.constructEvent` which encapsulates this. V2 reimplements in `_shared/stripe/webhooks/signature.ts` keeping the boundary tight. | Current Stripe docs (this commit). V1: [`stripe-integration/route.ts:194`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/webhooks/stripe-integration/route.ts#L194). |
| **6. V1 webhook receive route current or stale?** | **Current as of October 2025**, but encumbered by a **multi-secret fallback** (`stripe-integration/route.ts:175-228`) that tries every active webhook secret in the database until one verifies — used when the receive route can't resolve `workflowId` from the query string. This pattern is V1's workaround for endpoints created without `?workflowId=` in the URL (legacy endpoints, manual creation). V2 ships ONE clean receive route at `/api/webhooks/stripe` that **requires** the `workflowId` query param and verifies against THAT row's secret only. Reject 400 on missing param, 404 on lookup fail, 401 on signature fail. The `connect: true` event-account-matching logic (`stripe-integration/route.ts:268-288`) — filtering events by `connectedAccountId` when multiple workflows share an endpoint — is **not needed in V2** because V2's per-trigger endpoint shape means each trigger has its own endpoint URL with its own `?workflowId=` discriminator. | V1: [`app/api/webhooks/stripe-integration/route.ts:175-288`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/webhooks/stripe-integration/route.ts#L175). |

---

## V1 audit + port classification

V1 paths inspected:

| V1 path | What's there | Slice 11 classification |
|---|---|---|
| [`lib/integrations/oauthConfig.ts:530-543`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/oauthConfig.ts#L530) | OAuth config: `connect.stripe.com/oauth/{authorize,token}`, `authMethod: "body"`, `refreshRequiresClientAuth: true`, `sendRedirectUriWithRefresh: true`, `accessTokenExpiryBuffer: 30`, no scopes config | **Reference for OAuth wire-format.** V2 implements via typed `integrations/stripe/oauth.ts`. The `accessTokenExpiryBuffer` is dropped (V2's reactive 401 → refresh path doesn't need pre-emptive expiry math). |
| [`lib/integrations/tokenRefreshService.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/tokenRefreshService.ts) | Generic refresh helper handling Stripe via `oauthConfig` | **Skip.** V2's `services/oauth/refreshAndRetry.ts` + per-provider `refreshToken()` in `oauth.ts` covers this. |
| [`lib/triggers/providers/StripeTriggerLifecycle.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/providers/StripeTriggerLifecycle.ts) (385 LOC) | onActivate (creates webhook endpoint with `connect: true` + writes `trigger_resources`), onDeactivate (deletes endpoint), checkHealth (verifies endpoints exist, cleans orphans), getPlatformStripeClient | **Port mostly as-is, adapted to V2 patterns.** V2 splits into `triggers/eventReceived/{activate,deactivate,index}.ts` matching Slice 7 / 10 shape. **Skip orphan cleanup** (Q20). **Skip** the per-trigger-type → enabled_events `eventMap` (V1 lines 354-385) — V2's consolidated `event_received` trigger lets the user pick events directly from the curated allowlist (Q4). |
| [`app/api/webhooks/stripe-integration/route.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/webhooks/stripe-integration/route.ts) (~360 LOC) | Webhook receive: query-param-or-fallback workflow resolution, multi-secret signature verify loop, event-type matching, async dispatch via `after()` | **Rewrite per V2 boundary.** V2 ships ONE clean receive route at `/api/webhooks/stripe/route.ts` (~80 LOC) — strict workflowId query param required, single-secret verify, sync dispatch (V2's existing `dispatchTriggerEvent` pattern, not Next.js `after()`). Drops multi-secret fallback (Q6 / Q16). |
| [`lib/workflows/actions/stripe/utils.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/stripe/utils.ts) (35 LOC) | `flattenForStripe()` — recursive bracket-notation form-encoding | **Port verbatim** to `_shared/stripe/flattenForStripe.ts`. Heavily tested (V1's `__tests__/workflows/stripe-flatten.test.ts` ~180 LOC); V2 ports the test suite alongside. |
| [`lib/workflows/actions/stripe/createCustomer.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/stripe/createCustomer.ts) (235 LOC) | POST `/v1/customers` with comprehensive optional fields (address, shipping, tax_id_data, preferred_locales, invoice_settings, metadata) | **Reference for create_customer contract.** V2 ships ~120-150 LOC: typed schema (Q11), `flattenForStripe(body)`, plain POST. Optional fields gated on type — same wire-format as V1, smaller surface area on the schema (V2 omits Stripe niche surfaces like `tax_id_data` arrays in Batch 1). |
| [`lib/workflows/actions/stripe/updateCustomer.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/stripe/updateCustomer.ts) (238 LOC) | POST `/v1/customers/{id}` (Stripe convention — POST for updates) | **Reference.** V2 update_customer ~120 LOC. Same field set as create, all optional. |
| [`lib/workflows/actions/stripe/findCustomer.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/stripe/findCustomer.ts) (125 LOC) | Either GET `/v1/customers/{id}` or GET `/v1/customers?email=` — returns `found: false` on no match (does NOT throw NotFoundError) | **Port mostly as-is.** V2 find_customer same shape — returns `null` customer on no match (mirrors Slice 10 Airtable's `find_record`). |
| [`lib/workflows/actions/stripe/createPaymentIntent.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/stripe/createPaymentIntent.ts) (157 LOC) | POST `/v1/payment_intents` with `Idempotency-Key: ${sessionId}:${nodeId}:${actionType}` header. Amount in dollars → cents conversion (`Math.round(parseFloat(amount) * 100)`). Test mode short-circuits before Stripe call. | **Reference for Q4 idempotency contract.** V2 ports this verbatim — load-bearing for the new "Idempotency-Key on outbound POSTs" pattern. The test mode guard is replaced with V2's engine-level `executeNode` testMode interception (no per-handler short-circuit needed). |
| [`lib/workflows/actions/stripe/confirmPaymentIntent.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/stripe/confirmPaymentIntent.ts) (72 LOC) | POST `/v1/payment_intents/{id}/confirm`. No Idempotency-Key (lower stakes — confirm is itself idempotent server-side). | **Port mostly as-is.** ~70 LOC. |
| [`lib/workflows/actions/stripe/capturePaymentIntent.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/stripe/capturePaymentIntent.ts) (68 LOC) | POST `/v1/payment_intents/{id}/capture`. `amount_to_capture` in CENTS (not dollars — V1 uses `parseInt`, no conversion). | **Port mostly as-is.** ~65 LOC. **DOC** the cents-vs-dollars asymmetry in the schema description (Q11 — workflow authors who pass dollars will lose 99% of their capture amount). |
| [`lib/workflows/actions/stripe/createRefund.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/stripe/createRefund.ts) (164 LOC) | POST `/v1/refunds` with Idempotency-Key. Either `chargeId` or `paymentIntentId` (paymentIntentId preferred). Amount in dollars → cents. Test mode short-circuits. | **Port verbatim** with V2 adaptations (engine-level testMode, not per-handler). |
| [`lib/workflows/actions/stripe/createSubscription.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/stripe/createSubscription.ts) (175 LOC) | POST `/v1/subscriptions` with Idempotency-Key. Body: `{ customer, items: [{price}] }` (single price item). | **Port verbatim.** V2 create_subscription ~140 LOC. Single-item subscription only (Batch 1) — multi-item items array deferred. |
| [`lib/workflows/actions/stripe/updateSubscription.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/stripe/updateSubscription.ts) (145 LOC) | POST `/v1/subscriptions/{id}`. **Pre-fetches** subscription via GET to extract `subscription_item.id` (`si_xxx`), then includes `items: [{id, price, quantity}]` in body so the right item is updated. | **Port mostly as-is.** ~140 LOC. The pre-fetch GET + extract-item-id pattern is non-obvious — V2's schema documents it. **Both** the GET and the POST wrap in `refreshAndRetry` (auxiliary call discipline per CLAUDE.md §6). |
| [`lib/workflows/actions/stripe/cancelSubscription.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/stripe/cancelSubscription.ts) (92 LOC) | DELETE `/v1/subscriptions/{id}` with optional query params (`cancel_at_period_end`, `invoice_now`, `prorate`) | **Port mostly as-is.** ~80 LOC. |
| `lib/workflows/actions/stripe/{findPaymentIntent,findSubscription,findCharge,findInvoice,createCheckoutSession,createPaymentLink,createProduct,updateProduct,createPrice,createInvoice,createInvoiceItem,updateInvoice,finalizeInvoice,voidInvoice,listProducts,getPayments,getCustomers,handleTriggerEvent}.ts` | All other Stripe handlers | **Skip per accepted plan (Q2).** All deferred. |
| [`__tests__/workflows/stripe-flatten.test.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/__tests__/workflows/stripe-flatten.test.ts) (~180 LOC) | Tests `flattenForStripe()` against the production incident shape — empty / flat / nested / arrays-of-objects (canonical Checkout payload) / null-undefined-drop / boolean-stringify / round-trip-with-URLSearchParams | **Port verbatim** as V2 unit test. The "no `[object Object]` in final body" assertion is the load-bearing regression guard. |
| [`__tests__/nodes/stripe-create-payment-intent.test.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/__tests__/nodes/stripe-create-payment-intent.test.ts) (~210 LOC) | Q4 contract — first-fire records marker + sends `Idempotency-Key` header; replay returns cached without Stripe call; payload mismatch returns `PAYLOAD_MISMATCH`; different sessionId fires again with new key; absent meta = no header / no marker | **Port adapted to V2's idempotency helpers.** The contract assertions transfer directly; the wiring (V1's `checkReplay`/`recordFired` from `core/sessionSideEffects.ts` vs V2's equivalent) gets remapped. |
| [`__tests__/nodes/stripe-write-handlers.test.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/__tests__/nodes/stripe-write-handlers.test.ts) (~410 LOC) | Same Q4 contract for createSubscription, createCheckoutSession, createRefund | **Port adapted.** create_checkout_session is deferred — drop those tests; keep create_subscription + create_refund. |
| [`__tests__/webhooks/stripe-integration-v2-dispatch.test.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/__tests__/webhooks/stripe-integration-v2-dispatch.test.ts) (~175 LOC) | Webhook dispatch contract — routes to `executeWebhookWorkflow`, dedupKey = `event.id`, metadata includes `connectedAccount` | **Port adapted to V2's `dispatchTriggerEvent` shape.** The dedup-key + event-id-stability assertions transfer directly. |
| [`lib/integrations/airtable/airtableRateLimiter.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/airtableRateLimiter.ts) (Stripe equivalent if any) | None found for Stripe in V1 | **N/A.** Stripe's rate limit (100 req/s in live, 25 req/s in test) is gentle for Batch 1's action surface. V2 doesn't ship Stripe-specific rate limiting; if 429 becomes a real concern, add focused retry inside `_request.ts` later. |

---

## In-scope action list (final)

1. **`create_customer`** — `{ email, name?, phone?, description?, metadata?, address?, shipping?, payment_method?, invoice_prefix?, balance?, preferred_locales?, tax_exempt?, coupon?, promotion_code? }` → POST `/v1/customers`. **Idempotency-Key** header set. Returns `{ customerId, email, name, phone, description, created, currency, balance, delinquent, address, shipping, tax_exempt, metadata, livemode }`.
2. **`update_customer`** — `{ customerId, ...same as create }` (all customer fields optional) → POST `/v1/customers/{customerId}`. No Idempotency-Key (update is server-side idempotent on the resource id). Returns same shape as create.
3. **`find_customer`** — `{ customerId? } | { email? }` (one required) → GET `/v1/customers/{customerId}` or GET `/v1/customers?email=...&limit=1`. Returns `{ found: boolean, customer: object | null }` — never throws NotFoundError on no match.
4. **`create_payment_intent`** — `{ amount, currency, customerId?, description?, metadata?, payment_method?, payment_method_types?, confirm?, capture_method?, off_session?, setup_future_usage?, statement_descriptor? }` → POST `/v1/payment_intents`. **Idempotency-Key** header set. `amount` is in dollars (user-facing); converted to cents internally via `Math.round(parseFloat(amount) * 100)`. Returns `{ paymentIntentId, clientSecret, amount, currency, status, customerId, description, created, metadata, nextAction }`.
5. **`confirm_payment_intent`** — `{ paymentIntentId, payment_method?, receipt_email?, return_url? }` → POST `/v1/payment_intents/{id}/confirm`. No Idempotency-Key. Returns `{ paymentIntentId, status, amount, currency, clientSecret, nextAction }`.
6. **`capture_payment_intent`** — `{ paymentIntentId, amount_to_capture? }` → POST `/v1/payment_intents/{id}/capture`. **`amount_to_capture` is in CENTS** (Stripe API direct, no conversion — V1 quirk preserved with explicit schema doc). No Idempotency-Key. Returns `{ paymentIntentId, status, amount, amountCaptured, currency }`.
7. **`create_refund`** — `{ chargeId? } | { paymentIntentId? }` (one required), `{ amount?, reason?, metadata? }` → POST `/v1/refunds`. **Idempotency-Key** header set. `amount` in dollars → cents. Prefers `paymentIntentId` over `chargeId` when both supplied. Returns `{ refundId, amount, currency, status, charge, paymentIntent, reason, receiptNumber, created, metadata }`.
8. **`create_subscription`** — `{ customerId, priceId, default_payment_method?, payment_behavior?, trialPeriodDays?, metadata? }` → POST `/v1/subscriptions`. Body: `{ customer, items: [{price}], default_payment_method?, payment_behavior?, trial_period_days?, metadata }`. **Idempotency-Key** header set. Returns `{ subscriptionId, customerId, status, currentPeriodStart, currentPeriodEnd, cancelAtPeriodEnd, trialStart, trialEnd, priceId, quantity, created, metadata }`.
9. **`update_subscription`** — `{ subscriptionId, priceId?, quantity?, trial_end?, cancel_at_period_end?, proration_behavior?, default_payment_method?, metadata?, collection_method?, days_until_due? }` → first GET `/v1/subscriptions/{subscriptionId}` (auxiliary, wrapped in `refreshAndRetry`) to extract `items.data[0].id`, then POST `/v1/subscriptions/{subscriptionId}` with `items: [{id: si_xxx, price?, quantity?}]`. No Idempotency-Key (update). Returns `{ subscriptionId, customerId, status, currentPeriodStart, currentPeriodEnd, cancelAtPeriodEnd, trialStart, trialEnd, items, metadata }`.
10. **`cancel_subscription`** — `{ subscriptionId, at_period_end?, invoice_now?, prorate? }` → DELETE `/v1/subscriptions/{subscriptionId}` with optional query string. No Idempotency-Key. Returns `{ subscriptionId, status, canceledAt, cancelAtPeriodEnd, currentPeriodEnd, customerId, endedAt }`.

All actions wrap their **principal** API call in `refreshAndRetry`. Auxiliary calls (`update_subscription`'s pre-fetch GET) are also wrapped per CLAUDE.md §6 contract.

---

## OAuth model — refreshable + body-auth + Stripe Connect (no PKCE)

V2's first body-auth refreshable provider. Different shape from every existing V2 provider:

1. **`integrations/stripe/oauth.ts`** implements `ProviderOAuth`:
   - **No `generatePkce()`** method — Stripe Connect doesn't accept PKCE parameters.
   - `buildAuthUrl(state, scopes, pkce=null)` builds `https://connect.stripe.com/oauth/authorize?response_type=code&client_id=${STRIPE_CLIENT_ID}&scope=${scopes.join(' ')}&state=${state}&redirect_uri=${redirectUri}`. The `redirect_uri` is sent on authorize per Stripe docs. `scopes` is `["read_write"]` per Q6.
   - `handleCallback(code, state, pkce=null)` POSTs `https://connect.stripe.com/oauth/token` with `application/x-www-form-urlencoded` body containing `grant_type=authorization_code`, `code`, `client_secret=${STRIPE_CLIENT_SECRET}`. **No `Authorization: Basic` header — secret is in the body.** Response: `{ access_token, refresh_token, token_type: "bearer", scope, livemode, stripe_user_id, stripe_publishable_key }`. Returns `{ tokens: { accessTokenEncrypted: encrypt(access_token), refreshTokenEncrypted: encrypt(refresh_token), accessTokenExpiresAt: null, scopes: scope.split(" ") }, account: { providerAccountId: stripe_user_id, displayName: null, metadata: { stripeUserId: stripe_user_id, stripePublishableKey: stripe_publishable_key, livemode, scope } } }`. The `displayName` is null because Stripe Connect's token response doesn't include the merchant's display name — fetching it would require an extra `GET /v1/account` call which V2 defers to the user's connection-management UI.
   - `refreshToken(refreshToken)` POSTs the same `/oauth/token` endpoint with `application/x-www-form-urlencoded` body containing `grant_type=refresh_token`, `refresh_token`, `client_secret`. Response: `{ access_token, refresh_token, scope, livemode, stripe_user_id, stripe_publishable_key, token_type }`. **`refresh_token` field MAY OR MAY NOT** be present — if absent, V2 keeps the existing one (Stripe Connect tokens are not rotated; the refresh_token in the response, when present, is the same value V2 already has). V2's typed contract: returns `{ accessTokenEncrypted, refreshTokenEncrypted: encrypt(response.refresh_token ?? originalRefreshToken), accessTokenExpiresAt: null, scopes }` — handles either rotation behavior cleanly. **Throws** if `access_token` is missing (response invariant).
   - `revoke(token)` is a stub deferred to disconnect-UX slice (matches every V2 provider).

2. **Manifest** declares:
   - `refreshable: true`
   - `accountIdField: "stripeUserId"`
   - `tokenScope: "user"`
   - `oauthFlows: ["v2"]`
   - `scopes.required: ["read_write"]`
   - `apiVersion: "<pinned-version>"` (Stripe API version; e.g. `"2024-11-20.acacia"`)
   - `healthCheckIntervalMs: 12 * 60 * 60 * 1000` (12h)

3. **Health check** hits `GET /v1/account`. 200 → healthy; 401 → action_required after refresh attempt fails.

4. **No PKCE means no oauth_states verifier persistence for Stripe.** The dispatcher's `oauth.generatePkce?.()` returns undefined → no PKCE inputs threaded through state JWT or row.

---

## Webhook trigger model — programmatic + full-payload + no expiration

V2's first `Stripe-Signature`-style webhook trigger. Different from every existing V2 trigger:

1. **Activate** (`triggers/eventReceived/activate.ts`):
   - Reads `node.config.enabledEvents` (required, array of Stripe event-type strings; validated against the allowlist in `allowedEventTypes.ts` — Q4).
   - Reads the workflow id + node id from the activation context.
   - Builds the notification URL: `${V2_BASE_URL}/api/webhooks/stripe?workflowId=${workflowId}` (Q16).
   - Calls `webhookEndpointsCreate({ url, connect: true, enabled_events, description: \`ChainReact workflow ${workflowId}\`, api_version: STRIPE_API_VERSION })` from `_shared/stripe/api/webhookEndpoints.ts`. **Uses the platform secret** (`STRIPE_CLIENT_SECRET`) — NOT the user's OAuth-issued access token. Stripe Connect platforms use their own secret to manage Connect webhooks.
   - Returns config patch: `{ type: "subscription-watch", webhookEnabled: true, enabledEvents, webhookId, webhookSecret, webhookUrl, expiresAt: null }`. The `subscriptionRegistry` recognizes `type: "subscription-watch"` but for Stripe the renewal handler is a **no-op** (Q14) — registered with a `getRenewalThresholdMs(): Number.POSITIVE_INFINITY` returning never-due, OR (cleaner) Slice 11 simply does NOT register a handler at all for Stripe and lets the `subscriptionRegistry`'s "no handler matches" path skip the row.

   **Decision (after re-reading `services/triggers/subscriptionRegistry.ts` in Commit 4):** if the registry requires a `SubscriptionHandler` for any `type: "subscription-watch"` row, Slice 11 introduces a typed "non-expiring" subtype (`type: "subscription-watch-permanent"`) so the registry's matcher cleanly skips it. This decision is owned by Commit 4 and may flip if reading the existing registry shows a simpler path.

2. **Deactivate** (`triggers/eventReceived/deactivate.ts`):
   - DELETEs `/v1/webhook_endpoints/{webhookId}` with the platform secret.
   - Swallows 404 (already deleted server-side). Other errors propagate.

3. **No renewal** (Q14). Stripe webhook endpoints don't expire.

4. **Webhook receive** (`app/api/webhooks/stripe/route.ts`):
   - POST handler. Reads raw body via `request.text()` (signature verification needs raw bytes — JSON parsing destroys whitespace).
   - Reads `workflowId` from `URL(request.url).searchParams`. Missing → 400.
   - Looks up the trigger row by `(workflow_id, provider="stripe", status="active")` — single row expected (V2's per-trigger-endpoint shape). Lookup fail → 404.
   - Verifies `Stripe-Signature: t=...,v1=...` against the row's `config.webhookSecret` via `_shared/stripe/webhooks/signature.ts` `verifyStripeSignature(rawBody, signatureHeader, secret, toleranceSeconds=300)`. Throws `InvalidSignatureError` on mismatch. Route maps the error to 401.
   - Parses the body as JSON. Validates the event shape (`{id, type, data, created, ...}`) via Zod schema.
   - Validates `event.type` is in the trigger's `config.enabledEvents` (defense-in-depth — Stripe shouldn't deliver disabled events but the receive route filters anyway).
   - Builds a `TriggerEvent`: `{ provider: "stripe", eventType: event.type, eventId: event.id, occurredAt: new Date(event.created * 1000).toISOString(), accountId: event.account ?? "<platform>", payload: event.data.object }`.
   - Dispatches via `dispatchTriggerEvent(event)` → `webhook_event_dedup` blocks duplicates.

5. **Signature verify** (`_shared/stripe/webhooks/signature.ts`):
   - Parses header into `t=<unix>` and zero-or-more `v1=<hex>` (one-or-more enforced; zero candidates → InvalidSignatureError).
   - Validates `Math.abs(now - t) <= toleranceSeconds` — reject on stale.
   - Computes `expected = createHmac("sha256", secret).update(\`${t}.${rawBody}\`).digest("hex")`.
   - Constant-time compares `expected` against each `v1=` candidate via `timingSafeEqual` (after equal-length check). Accept on any match.
   - Throws typed `InvalidSignatureError` on no-match / stale-timestamp / malformed-header / missing-signature-header.

6. **Dispatch** runs through V2's `services/triggers/dispatch.ts` — DB-backed `webhook_event_dedup` blocks duplicates. Same shape as Slice 7 / 8 / 9 / 10.

---

## Idempotency strategy

V2's first slice that threads `Idempotency-Key` onto an outbound provider POST. Three layers of dedup:

1. **Stripe server-side** — Stripe's own 24-hour idempotency window keyed on `Idempotency-Key` header. Same key + same payload → same response (cached). Same key + different payload → Stripe returns an error specifically about idempotency conflicts.
2. **V2 session-side marker** (Q4) — `core/workflows/idempotency.ts` `buildIdempotencyKey` + `hashPayload`. The handler checks for a prior fire with the same key in the same execution session; on hit, returns the cached result without calling Stripe. On payload mismatch → typed `PAYLOAD_MISMATCH` failure shape.
3. **Trigger-side** — `webhook_event_dedup` keyed on `(provider, event.id)` blocks duplicate inbound events from Stripe's retry storms (independent of the action-side idempotency).

For Slice 11, the four idempotency-keyed actions (`create_customer`, `create_payment_intent`, `create_refund`, `create_subscription`) follow this pattern:

```
const idempotencyKey = buildIdempotencyKey({sessionId, nodeId, actionType});
const payloadHash = hashPayload(canonicalize(body));

// V2's Q4 helper layer — TBD in Commit 3 whether checkReplay/recordFired
// are shipped as part of this slice or deferred. If absent in V2 today,
// Slice 11 introduces them as a typed wrapper around session-scoped
// dedup state (likely a new table, or session_side_effects column on
// workflow_execution_sessions). STOP-AND-REPORT if a new table is needed.

const headers = {
  "Authorization": `Bearer ${accessToken}`,
  "Content-Type": "application/x-www-form-urlencoded",
  "Idempotency-Key": formatProviderIdempotencyKey({sessionId, nodeId, actionType}),
};
```

The `formatProviderIdempotencyKey` helper is V2-new in Slice 11 — returns the wire-format Stripe expects (V1's shape: `${rootExecutionId}:${nodeId}:${actionType}`). Future providers (Square, Shopify) can reuse it.

**Open question** (flagged for Commit 3): does V2 today have `checkReplay` / `recordFired` (V1's `core/sessionSideEffects.ts` equivalents)? V2's `core/workflows/idempotency.ts` ships `buildIdempotencyKey` + `hashPayload` as PURE helpers — V2's existing Q4 contract is "the helpers exist; storage is deferred." Commit 3 audits whether storage exists. If absent: **Slice 11 ships JUST the provider-side `Idempotency-Key` header (Stripe's 24-hour window covers the most-common retry case) and defers session-side checkReplay to a future slice**. The two layers are independently useful — Stripe's own window protects against retries within a session; session-side only matters for V2-triggered re-invocations.

---

## V1 patterns to skip

- **V1's per-trigger-type → enabled_events `eventMap`** (`StripeTriggerLifecycle.ts:354-385`). V2's consolidated `event_received` trigger lets workflow authors pick events directly; no eventMap layer. (Q3)
- **Multi-secret signature-verify fallback** (`stripe-integration/route.ts:175-228`). V2 requires `workflowId` query param and verifies against THAT row's secret only. (Q6 / Q16)
- **`cleanupOrphanedEndpoints()`** (`StripeTriggerLifecycle.ts:300-349`). Not needed in V2's straight-line lifecycle. (Q20)
- **`accessTokenExpiryBuffer: 30`** pre-emptive refresh window. V2's reactive `refreshAndRetry` 401 → refresh path doesn't need pre-emptive expiry math. (Q5)
- **Per-handler `testMode` short-circuits** (every Stripe action checks `if (context.testMode) return simulated`). V2's engine-level `executeNode` testMode interception covers this — handlers don't need their own guard. (CLAUDE.md §10)
- **Stripe SDK in handlers / receive route.** V1 imports `Stripe` SDK directly into per-handler files for some operations and into the receive route for `stripe.webhooks.constructEvent`. V2 keeps the SDK out of `integrations/stripe/actions/` and out of `app/api/webhooks/stripe/route.ts` — all REST goes through `_shared/stripe/api/_request.ts`; signature verify goes through `_shared/stripe/webhooks/signature.ts`. The platform Stripe SDK (`getStripeClient()` at V1's `lib/stripe/client.ts`) is allowed at the **trigger lifecycle layer** for webhook-endpoint management (since V2 might prefer the SDK's typed surface for `webhookEndpoints.create/del`), but it stays out of action handlers and the receive route.
- **Next.js `after()` for async dispatch.** V2's existing `dispatchTriggerEvent` is sync-then-enqueue and works within Next's per-route timeout — no `after()` needed. (V1 uses it to escape Vercel's 60s timeout; V2's dispatch is enqueue-only at the route layer, with execution happening in the worker pool.)
- **V1 per-action testMode check + per-action access-token decryption boilerplate.** V2 handlers receive a `userId` and call `refreshAndRetry({ userId, provider: "stripe", apiCall: token => ... })` — token decryption is owned by the dispatcher.
- **`account` event-matching logic** (`stripe-integration/route.ts:268-288`). V2's per-trigger-endpoint shape means each trigger has its own `?workflowId=` URL — no need to filter events by `connectedAccountId` post-hoc.
- **V1's 14 separate trigger node types.** V2 ships ONE `event_received` per Q3. Workflow authors who imported V1's `stripe_trigger_new_payment` to listen for `payment_intent.succeeded` simply select that event-type from V2's allowlist instead.
- **V1's 25+ Stripe action node types.** V2 ships 10 per Batch 1 per Q2. The deferred 15+ are tracked for future batches — none are blocking for the V2 "first 10 providers" milestone.
- **V1's amount-handling-as-cents-or-dollars inconsistency.** V1's `create_payment_intent` takes dollars (converts to cents), `capture_payment_intent` takes cents (no conversion). V2 documents this in each schema's description (Q11) — the contract is loud. Future V2 work may normalize all amounts to cents at the schema layer (consistent with Stripe's wire-format) but Slice 11 preserves V1's behavior to keep the port mechanical.
- **V1's app-billing Stripe code under `lib/billing/`, `app/api/cron/report-overage`, `app/api/billing/`, `app/api/webhooks/stripe-billing/`, etc.** Entirely orthogonal to the user-provider Stripe integration. V2's app-billing equivalent lives elsewhere; Slice 11 does not touch it. (Q19)

---

## V1 rot to fix during port

- **Direct workflowId/triggerResource lookup in webhook receive.** No multi-secret fallback. (Q6 / Q16)
- **Single source of truth for trigger state — `trigger_resources` only.** V1 has older Stripe-specific tables; V2 ships only `trigger_resources`. (Q18)
- **Strict Q11 schemas** for every action — no `config: any` handlers. (CLAUDE.md §6)
- **Typed `flattenForStripe`** — V1 ships it as `Record<string, any>` → `Record<string, string>`; V2 narrows to `Readonly<Record<string, unknown>>` → `Readonly<Record<string, string>>` and adds Zod-schema-driven type checking at the call site (each handler builds its body to a typed object before flattening).
- **One clean receive route** (~80 LOC) instead of V1's ~360-LOC mega-route with multi-secret loop + event-matching filter + Next.js `after()` + dispatch.
- **No Stripe SDK in handlers / receive.** Boundary discipline. (V1 patterns to skip §)
- **Idempotency-Key as a load-bearing pattern.** V2 surfaces the formatted key at the schema-validated boundary so the assertion shape (V2 unit tests) confirms the wire-format. V1's tests do this implicitly; V2 makes it explicit.
- **Webhook signature verification moves out of the Stripe SDK.** `_shared/stripe/webhooks/signature.ts` reimplements `t=,v1=` HMAC + tolerance + multi-candidate compare in ~50 LOC. Easier to test, no SDK boundary leak.

---

## Open questions / decisions to flag

1. **`subscriptionRegistry` for never-expiring subscriptions.** Stripe webhook endpoints don't expire. V2's existing `subscriptionRegistry` is built around renewable subscriptions. Slice 11 Commit 4 needs to either (a) introduce a no-op handler with `getRenewalThresholdMs(): Number.POSITIVE_INFINITY`, (b) introduce a typed "subscription-watch-permanent" subtype the registry skips, or (c) confirm the registry already handles "no handler matches" gracefully. Decision deferred to Commit 4 after reading the registry's matcher.
2. **V2's session-side checkReplay storage.** V2's `core/workflows/idempotency.ts` ships pure helpers but Slice 11 needs to know whether session-scoped storage exists today. Commit 3 audits this — if absent, Slice 11 ships only the provider-side `Idempotency-Key` header and defers session-side dedup to a future slice. **STOP-AND-REPORT** if a new table or migration is needed.
3. **`stripe_user_id` stability.** Per current Stripe Connect docs, `stripe_user_id` (the connected account id `acct_xxx`) is stable for the life of the merchant's Stripe account. Treating it as the immutable provider account id matches the V2 contract for `accountIdField`.
4. **Health check on revoked merchant connections.** If a merchant disconnects ChainReact from their Stripe dashboard, the access token is revoked. V2's health check (`GET /v1/account` with the merchant token) returns 401 → triggers refresh attempt → refresh also fails (revoked) → V2 surfaces `IntegrationActionRequiredError(reason: "refresh_failed")`. Confirming this matches the user-facing reconnect prompt from existing V2 health UI.
5. **API version pinning.** Stripe deprecates and updates API versions periodically. Slice 11 pins `apiVersion` in the manifest + sends `Stripe-Version` header on all `_shared/stripe/api/_request.ts` calls. The pinned version is a const at implementation time. **DECISION — pin the latest GA version available at Commit 2 time** (likely `2024-11-20.acacia` or a newer one). Document in the manifest's JSDoc.
6. **`amount_to_capture` cents-vs-dollars asymmetry.** V1's `capture_payment_intent` takes cents directly; `create_payment_intent` and `create_refund` take dollars. V2 preserves this asymmetry for mechanical port — the schema description warns workflow authors loudly. Future normalization is a separate consideration (would require all-handlers schema migration).

---

## Revised commit shape

| Commit | Title | Scope |
|---|---|---|
| **1** | `docs: slice 11 stripe plan` | This file. |
| **2** | `feat(stripe): manifest + OAuth + dispatcher registration` | `integrations/stripe/{manifest,oauth}.ts`, `services/oauth/dispatcher.ts` register, `_shared/stripe/api/_base.ts` (Stripe REST base + `STRIPE_API_VERSION` const). Manifest capabilities: `oauth: true`, others `false`. Tests: manifest validation, OAuth wire-format (body-auth, no PKCE, scope=read_write), refresh roundtrip (returns same refresh_token when Stripe omits it from response), `stripe_user_id` → `providerAccountId` mapping. |
| **3** | `feat(stripe): 10 actions + flattenForStripe + Stripe REST wrappers + Idempotency-Key` | `_shared/stripe/flattenForStripe.ts` (V1 port verbatim), `_shared/stripe/api/{_request,customers,paymentIntents,refunds,subscriptions}.ts` HTTP wrappers (Bearer auth, `application/x-www-form-urlencoded` content-type, `Stripe-Version` header, refreshAndRetry-friendly), `core/workflows/formatProviderIdempotencyKey.ts` (new helper alongside existing `buildIdempotencyKey`), 10 typed action handlers + Q11 schemas, registry updates. Manifest flips `actions: true`. Tests: `flattenForStripe` round-trip + production-incident regression, every handler's body construction (snapshot test on the flattened wire-format string), Idempotency-Key header presence on the four create-actions, amount cents conversion. |
| **4** | `feat(stripe): event_received webhook trigger + Stripe-Signature verification` | `_shared/stripe/api/webhookEndpoints.ts` (create / delete via platform secret), `_shared/stripe/webhooks/signature.ts` (HMAC `${t}.${rawBody}` verify + 300s tolerance + multi-candidate match), `integrations/stripe/triggers/eventReceived/{activate,deactivate,allowedEventTypes,index}.ts`, `app/api/webhooks/stripe/route.ts` (signature verify, lookup, dispatch). Subscription via `subscriptionRegistry` either as no-op handler or skipped subtype (decision finalized in this commit). Manifest flips `webhookTrigger: true`. Tests: signature verify (valid / stale-timestamp / malformed-header / multi-v1-candidate-rotation / wrong-secret), receive route (400 on missing workflowId, 404 on lookup fail, 401 on signature fail, 200 + dispatch on success), event-type allowlist enforcement, dedup on duplicate `event.id`. |
| **5** | `test(e2e): add Stripe walkthrough with mocked Stripe boundary` | New `tests/e2e/helpers/mockStripeServer.ts` (port 9881) — OAuth (authorize 302, token exchange with body-auth, refresh with stable refresh_token), `/v1/account`, `/v1/customers` (POST + GET-by-id + GET-by-email), `/v1/payment_intents` (POST + confirm + capture), `/v1/refunds` (POST), `/v1/subscriptions` (POST + GET-by-id + POST update + DELETE), `/v1/webhook_endpoints` (POST + DELETE), signed webhook delivery via test control plane. New `tests/e2e/slice-11-stripe-walkthrough.spec.ts` exercising: state consume (no PKCE, scope=read_write), tokens encrypted, action call uses Bearer + Idempotency-Key (asserted on the recorded POST), signed webhook dispatches workflow, duplicate `event.id` dedups, invalid signature rejected, stale timestamp rejected. |

**Total estimated output:** ~600 LOC OAuth + helpers + ~1,200 LOC actions + wrappers + flatten + Idempotency-Key + ~500 LOC trigger + receive + signature + ~1,000 LOC e2e ≈ **~3,300 LOC** + **~150 new unit tests** + **1 e2e**. Comparable to Slice 10 because the new patterns (body-auth, Stripe-Signature, Idempotency-Key) net out against the simpler trigger model (no cursor fetch, no renewal).

---

## Validation gates

After each meaningful commit:

```bash
npx tsc --noEmit
npm run lint
npm run lint:structure
npm run lint:migrations
npm test
```

For Commit 5 (e2e), run all sequential provider walkthroughs + Stripe twice for stability:

```bash
npx playwright test tests/e2e/slice-1-slack-walkthrough.spec.ts
npx playwright test tests/e2e/slice-2f-gmail-walkthrough.spec.ts
npx playwright test tests/e2e/slice-3b-google-calendar-walkthrough.spec.ts
npx playwright test tests/e2e/slice-4b-google-drive-walkthrough.spec.ts
npx playwright test tests/e2e/slice-5b-google-sheets-walkthrough.spec.ts
npx playwright test tests/e2e/slice-6-outlook-mail-walkthrough.spec.ts
npx playwright test tests/e2e/slice-7-outlook-calendar-walkthrough.spec.ts
npx playwright test tests/e2e/slice-8-onedrive-walkthrough.spec.ts
npx playwright test tests/e2e/slice-9-notion-walkthrough.spec.ts
npx playwright test tests/e2e/slice-10-airtable-walkthrough.spec.ts
npx playwright test tests/e2e/slice-11-stripe-walkthrough.spec.ts
npx playwright test tests/e2e/slice-11-stripe-walkthrough.spec.ts
```

---

## External setup

- **Stripe Connect platform app** registered in the Stripe dashboard (already done in V1 — the existing `STRIPE_CLIENT_ID` env confirms).
- **Env vars required:**
  - `STRIPE_CLIENT_ID` — Stripe Connect platform's `ca_xxx` client id (used in OAuth authorize URL).
  - `STRIPE_CLIENT_SECRET` — Stripe Connect platform's `sk_xxx` secret key. Used for OAuth token exchange + refresh (body-auth) AND for webhook-endpoint management on the platform account. Same secret, two purposes — Stripe's Connect model.
- **Webhook signing secret** — returned per-endpoint at creation time as `whsec_xxx`. Stored in `trigger_resources.config.webhookSecret`. NO env var needed.
- **E2E mock** (`tests/e2e/helpers/mockStripeServer.ts`) does NOT require real Stripe credentials — runs on port 9881, intercepts both `connect.stripe.com` and `api.stripe.com` URLs, uses fixture secrets.

---

## Constraints

- No push.
- No PR.
- No DB migration (stop and report if one becomes necessary).
- No PKCE (Stripe Connect doesn't accept it).
- No multi-secret webhook fallback.
- No orphan-endpoint cleanup cron.
- No Stripe SDK in handlers or receive route (boundary discipline).
- No 14-trigger-type explosion — one consolidated `event_received` with `eventType` discriminator.
- No 25+ action handlers — focused 10-action Batch 1.
- No app-billing entanglement — `lib/billing/`, `app/api/webhooks/stripe-billing/` etc. stay untouched.
- No per-handler testMode short-circuits — engine-level interception only.
- No pre-emptive token-expiry-buffer arithmetic — reactive 401-driven refresh only.
- No `accessTokenExpiresAt` written if Stripe doesn't return `expires_in` (null is honest).
- No support for deferred event types — fail loud at activation with typed validation error.
